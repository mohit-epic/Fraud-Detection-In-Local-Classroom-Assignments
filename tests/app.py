import os
import numpy as np
import pandas as pd
import docx
import pickle
import csv
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
from sklearn.preprocessing import normalize
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from datetime import datetime

nltk.download('punkt')
nltk.download('vader_lexicon')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = "assignments/"
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

model = SentenceTransformer("paraphrase-MiniLM-L6-v2")

sid = SentimentIntensityAnalyzer()

def extract_text(file_path):
    """Extracts text from .txt and .docx files as a list of paragraphs."""
    if file_path.endswith(".txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        return paragraphs
    elif file_path.endswith(".docx"):
        doc = docx.Document(file_path)
        return [para.text for para in doc.paragraphs if para.text.strip()]
    return []

def get_all_submissions(exclude_filename=None):
    """Loads all previous submissions except the new file."""
    submissions = []
    for file in os.listdir(app.config['UPLOAD_FOLDER']):
        if file != exclude_filename:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], file)
            submissions.append("\n".join(extract_text(file_path)))
    return submissions

def collect_metadata(file_path, text):
    """Collects metadata for a given file."""
    file_size = os.path.getsize(file_path) 
    word_count = len(text.split())          
    submission_time = datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S")  
    return {
        'file_size': file_size,
        'word_count': word_count,
        'submission_time': submission_time
    }

def find_matching_segments(new_text, submissions):
    """Identifies sentences in new_text that match submissions with similarity scores."""
    new_sentences = sent_tokenize(new_text)
    submission_text = " ".join(submissions)
    submission_sentences = sent_tokenize(submission_text)

    new_embeddings = model.encode(new_sentences, convert_to_tensor=True)
    submission_embeddings = model.encode(submission_sentences, convert_to_tensor=True)
    
    new_embeddings = normalize(new_embeddings.cpu().numpy())
    submission_embeddings = normalize(submission_embeddings.cpu().numpy())
    
    matches = []
    for i, new_sent in enumerate(new_sentences):
        similarities = cosine_similarity(
            new_embeddings[i].reshape(1, -1), submission_embeddings
        ).flatten()
        max_similarity = max(similarities, default=0)
        if max_similarity > 0.5:
            matches.append({
                "sentence": new_sent,
                "similarity": max_similarity * 100
            })
    return matches

def find_matching_segments_between_two(text1, text2):
    """Identifies matching sentences between two texts."""
    sentences1 = sent_tokenize(text1)
    sentences2 = sent_tokenize(text2)
    
    embeddings1 = model.encode(sentences1, convert_to_tensor=True)
    embeddings2 = model.encode(sentences2, convert_to_tensor=True)
    
    embeddings1 = normalize(embeddings1.cpu().numpy())
    embeddings2 = normalize(embeddings2.cpu().numpy())
    
    matches = []
    for i, sent1 in enumerate(sentences1):
        similarities = cosine_similarity(
            embeddings1[i].reshape(1, -1), embeddings2
        ).flatten()
        for j, sim in enumerate(similarities):
            if sim > 0.5:
                matches.append({
                    "sentence1": sent1,
                    "sentence2": sentences2[j],
                    "similarity": sim * 100
                })
    return matches

def check_plagiarism_tfidf(new_text, submissions):
    """Checks plagiarism using TF-IDF."""
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    corpus = [new_text] + submissions
    tfidf_matrix = vectorizer.fit_transform(corpus)
    similarity_scores = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
    return max(similarity_scores, default=0) * 100


def check_plagiarism_deep(new_text, submissions):
    """Checks plagiarism using SentenceTransformer."""
    embeddings = model.encode([new_text] + submissions, convert_to_tensor=True)
    normalized_embeddings = normalize(embeddings.cpu().numpy())
    similarity_scores = cosine_similarity(normalized_embeddings[0].reshape(1, -1), normalized_embeddings[1:]).flatten()
    return max(similarity_scores, default=0) * 100

def compute_paragraph_metrics(paragraph):
    """Computes sentiment, type-token ratio, and average sentence length for a paragraph."""
    sentiment = sid.polarity_scores(paragraph)['compound']
    words = word_tokenize(paragraph)
    sentences = sent_tokenize(paragraph)
    unique_words = set(words)
    ttr = len(unique_words) / len(words) if words else 0
    avg_sent_len = sum(len(sent.split()) for sent in sentences) / len(sentences) if sentences else 0
    return {"sentiment": sentiment, "ttr": ttr, "avg_sent_len": avg_sent_len}

def detect_inconsistencies(metrics):
    """Detects inconsistencies in writing style between consecutive paragraphs."""
    inconsistent = [False] * len(metrics)
    for i in range(1, len(metrics)):
        prev = metrics[i-1]
        curr = metrics[i]
        if (abs(curr['sentiment'] - prev['sentiment']) > 0.5 or
            abs(curr['ttr'] - prev['ttr']) > 0.1 or
            abs(curr['avg_sent_len'] - prev['avg_sent_len']) > 5):
            inconsistent[i] = True
    return inconsistent

def log_results(filename, tfidf_score, deep_score):
    """Logs plagiarism detection results."""
    log_file = "plagiarism_results.csv"
    file_exists = os.path.isfile(log_file)
    with open(log_file, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Filename", "TF-IDF Score", "Deep Learning Score"])
        writer.writerow([filename, f"{tfidf_score:.2f}%", f"{deep_score:.2f}%"])

# Flask Routes
@app.route("/", methods=["GET"])
def home():
    """Renders the home page with a list of existing assignments."""
    assignments = os.listdir(app.config['UPLOAD_FOLDER'])
    return render_template("index.html", assignments=assignments)

@app.route("/check_plagiarism", methods=["POST"])
def check_plagiarism():
    """API endpoint to check plagiarism and return JSON results with detailed errors."""
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file part in the request"}), 400
    
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "message": "No file selected"}), 400
    
    # Add file type and size validation
    allowed_extensions = {'.txt', '.docx'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        return jsonify({"success": False, "message": f"Unsupported file type. Only {', '.join(allowed_extensions)} are allowed."}), 400
    
    max_size = 5 * 1024 * 1024  # 5 MB limit
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)  # Reset file pointer
    if file_size > max_size:
        return jsonify({"success": False, "message": "File size exceeds 5 MB limit"}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    try:
        file.save(file_path)
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to save file: {str(e)}"}), 500

    try:
        paragraphs = extract_text(file_path)
        if not paragraphs:
            return jsonify({"success": False, "message": "No text could be extracted from the file"}), 400
        
        new_text = "\n".join(paragraphs)
        submissions = get_all_submissions(exclude_filename=filename)

        tfidf_score = check_plagiarism_tfidf(new_text, submissions)
        deep_score = check_plagiarism_deep(new_text, submissions)

        # Log results
        log_results(filename, tfidf_score, deep_score)

        # Clean up temporary file
        os.remove(file_path)

        return jsonify({
            "success": True,
            "tfidf_score": f"{tfidf_score:.2f}",
            "deep_score": f"{deep_score:.2f}"
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"Error processing plagiarism check: {str(e)}"}), 500

@app.route("/upload", methods=["POST"])
def upload_file():
    """Handles file upload, plagiarism checking, and style analysis for a single assignment."""
    if "file" not in request.files:
        return jsonify({"error": "No file part"})
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"})
    
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(file_path)

    paragraphs = extract_text(file_path)
    new_text = "\n".join(paragraphs)
    submissions = get_all_submissions(exclude_filename=filename)

    tfidf_score = check_plagiarism_tfidf(new_text, submissions)
    deep_score = check_plagiarism_deep(new_text, submissions)
    matches = find_matching_segments(new_text, submissions)

    metrics = [compute_paragraph_metrics(p) for p in paragraphs]
    inconsistent = detect_inconsistencies(metrics)

    file_size = os.path.getsize(file_path)
    word_count = len(new_text.split())
    submission_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    metadata = {
        'file_size': file_size,
        'word_count': word_count,
        'submission_time': submission_time
    }

    log_results(filename, tfidf_score, deep_score)

    return render_template(
        "result.html",
        mode='single',
        tfidf_score=f"{tfidf_score:.2f}%",
        deep_score=f"{deep_score:.2f}%",
        paragraphs=paragraphs,
        inconsistent=inconsistent,
        matches=matches,
        metadata=metadata
    )

@app.route("/compare", methods=["POST"])
def compare_assignments():
    """Handles comparison between two selected assignments."""
    assignment1 = request.form.get('assignment1')
    assignment2 = request.form.get('assignment2')
    
    if not assignment1 or not assignment2:
        return jsonify({"error": "Please select two assignments."})
    
    if assignment1 == assignment2:
        return jsonify({"error": "Please select two different assignments."})

    file_path1 = os.path.join(app.config['UPLOAD_FOLDER'], assignment1)
    file_path2 = os.path.join(app.config['UPLOAD_FOLDER'], assignment2)
    
    if not os.path.exists(file_path1) or not os.path.exists(file_path2):
        return jsonify({"error": "One or both selected files do not exist."})

    paragraphs1 = extract_text(file_path1)
    paragraphs2 = extract_text(file_path2)
    text1 = "\n".join(paragraphs1)
    text2 = "\n".join(paragraphs2)
    
    tfidf_score = check_plagiarism_tfidf(text1, [text2])
    deep_score = check_plagiarism_deep(text1, [text2])
    
    matches = find_matching_segments_between_two(text1, text2)
    
    matches_in_text1 = list(set([m['sentence1'] for m in matches]))
    matches_in_text2 = list(set([m['sentence2'] for m in matches]))
    
    metadata1 = collect_metadata(file_path1, text1)
    metadata2 = collect_metadata(file_path2, text2)

    return render_template(
        "result.html",
        mode='compare',
        assignment1=assignment1,
        assignment2=assignment2,
        paragraphs1=paragraphs1,
        paragraphs2=paragraphs2,
        matches_in_text1=matches_in_text1,
        matches_in_text2=matches_in_text2,
        tfidf_score=f"{tfidf_score:.2f}%",
        deep_score=f"{deep_score:.2f}%",
        metadata1=metadata1,
        metadata2=metadata2
    )

if __name__ == "__main__":
    app.run(debug=True)