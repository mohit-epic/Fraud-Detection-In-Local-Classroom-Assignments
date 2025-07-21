import os
import pytest
from flask import Flask
from app import app, extract_text, check_plagiarism_tfidf, check_plagiarism_deep, compute_paragraph_metrics, detect_inconsistencies, collect_metadata

@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app.config["TESTING"] = True
    app.config["UPLOAD_FOLDER"] = "test_uploads/"
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    with app.test_client() as client:
        yield client
    # Cleanup after tests
    for file in os.listdir(app.config["UPLOAD_FOLDER"]):
        os.remove(os.path.join(app.config["UPLOAD_FOLDER"], file))
    os.rmdir(app.config["UPLOAD_FOLDER"])

def test_home(client):
    """Test the home page loads correctly."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"Assignments" in response.data


def test_extract_text():
    """Test text extraction from a .txt file."""
    file_path = "test.txt"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("This is a test file.\n\nThis is another paragraph.")

    extracted_text = extract_text(file_path)
    os.remove(file_path)
    
    assert extracted_text == ["This is a test file.", "This is another paragraph."]

def test_tfidf_plagiarism():
    """Test TF-IDF plagiarism detection."""
    text = "This is a test sentence."
    submissions = ["This is a different sentence.", "Another unique text."]
    score = check_plagiarism_tfidf(text, submissions)
    
    assert 0 <= score <= 100  # Ensure score is within valid range

def test_deep_plagiarism():
    """Test deep learning plagiarism detection."""
    text = "This is a sample document."
    submissions = ["This is another document with different content."]
    score = check_plagiarism_deep(text, submissions)
    
    assert 0 <= score <= 100  # Ensure score is within valid range

def test_metadata_collection():
    """Test metadata collection for an uploaded file."""
    file_path = "test_metadata.txt"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("This is a test file.")

    metadata = collect_metadata(file_path, "This is a test file.")
    os.remove(file_path)
    
    assert "file_size" in metadata
    assert "word_count" in metadata
    assert "submission_time" in metadata
    assert metadata["word_count"] == 5

def test_paragraph_metrics():
    """Test paragraph metrics calculation."""
    paragraph = "This is a short paragraph. It has multiple sentences."
    metrics = compute_paragraph_metrics(paragraph)
    
    assert "sentiment" in metrics
    assert "ttr" in metrics
    assert "avg_sent_len" in metrics
    assert 0 <= metrics["sentiment"] <= 1

def test_detect_inconsistencies():
    """Test detection of inconsistencies in writing style."""
    metrics = [
        {"sentiment": 0.5, "ttr": 0.8, "avg_sent_len": 10},
        {"sentiment": 0.1, "ttr": 0.7, "avg_sent_len": 15},
        {"sentiment": 0.6, "ttr": 0.9, "avg_sent_len": 8}
    ]
    inconsistencies = detect_inconsistencies(metrics)
    
    assert isinstance(inconsistencies, list)
    assert len(inconsistencies) == len(metrics)
