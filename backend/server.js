const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/assignments", express.static(path.join(__dirname, "..", "frontend", "assignments")));
app.use(express.static(path.join(__dirname, "frontend")));

// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/school_db", {
    family: 4,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err.message, err.stack));

// Schemas
const StudentRequestSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const StudentSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetToken: String,
    resetTokenExpiry: Date,
    subjects: [String],
});

const TeacherSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    subjects: [String],
});

const AssignmentSchema = new mongoose.Schema({
    teacher_username: { type: String, required: true },
    subject: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    deadline: { type: Date, required: true },
    folderPath: { type: String },
    submissions: [{
        studentUsername: { type: String, required: true },
        filePath: { type: String, required: true },
        originalFileName: { type: String, required: true },
        submittedAt: { type: Date, default: Date.now }
    }]
});

const StudentRequest = mongoose.model("StudentRequest", StudentRequestSchema);
const Student = mongoose.model("Student", StudentSchema);
const Teacher = mongoose.model("Teacher", TeacherSchema);
const Assignment = mongoose.model("Assignment", AssignmentSchema);

// Sanitize folder names
const sanitizeFolderName = (name) => {
    return name
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim()
        .replace(/\s+/g, "_");
};

// Multer configuration
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const assignmentId = req.params.assignmentId;
        try {
            const assignment = await Assignment.findById(assignmentId);
            if (!assignment) {
                return cb(new Error("Assignment not found"));
            }
            const folderName = sanitizeFolderName(assignment.description);
            const folderPath = path.join(__dirname, "..", "frontend", "assignments", folderName);
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`Folder ensured/created: ${folderPath}`);
            cb(null, folderPath);
        } catch (error) {
            console.error(`Error creating folder for assignment ${assignmentId}:`, error);
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const filename = `${req.body.studentUsername}-${Date.now()}-${file.originalname}`;
        console.log(`Saving file as: ${filename}`);
        cb(null, filename);
    },
});
const upload = multer({ storage });

// Root endpoint
app.get("/", (req, res) => res.send("Backend is running!"));

// Student Registration
app.post("/api/students/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        const existingRequest = await StudentRequest.findOne({ email });
        if (existingRequest) {
            return res.status(400).json({ success: false, message: "Request already pending!" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await StudentRequest.create({ username, email, password: hashedPassword });
        res.json({ success: true, message: "Student request sent for approval" });
    } catch (error) {
        console.error("Error in student registration:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Get Pending Student Requests
app.get("/api/students/requests", async (req, res) => {
    try {
        const requests = await StudentRequest.find();
        res.json(requests);
    } catch (error) {
        console.error("Error fetching student requests:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Approve Student Registration
app.post("/api/students/approve", async (req, res) => {
    try {
        const { id } = req.body;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid request ID" });
        }
        const request = await StudentRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }
        const existingStudent = await Student.findOne({
            $or: [{ email: request.email }, { username: request.username }],
        });
        if (existingStudent) {
            return res.status(400).json({
                success: false,
                message: "A student with this email or username already exists",
            });
        }
        await Student.create({
            username: request.username,
            email: request.email,
            password: request.password,
            subjects: ["Mathematics", "Physics", "Chemistry"],
        });
        await StudentRequest.findByIdAndDelete(id);
        res.json({ success: true, message: "Student approved!" });
    } catch (error) {
        console.error("Error approving student:", error.stack);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

// Reject Student Request
app.post("/api/students/reject", async (req, res) => {
    try {
        const { id } = req.body;
        await StudentRequest.findByIdAndDelete(id);
        res.json({ success: true, message: "Student request rejected!" });
    } catch (error) {
        console.error("Error rejecting request:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Student Login
app.post("/api/students/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const student = await Student.findOne({ username });
        if (!student || !(await bcrypt.compare(password, student.password))) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        res.json({ success: true, username: student.username, email: student.email });
    } catch (error) {
        console.error("Error in student login:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Teacher Registration
app.post("/api/teachers/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ success: false, message: "Teacher already registered!" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await Teacher.create({
            username,
            email,
            password: hashedPassword,
            subjects: ["Mathematics", "Physics", "Chemistry"],
        });
        res.json({ success: true, message: "Teacher registered successfully!" });
    } catch (error) {
        console.error("Error in teacher registration:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Teacher Login
app.post("/api/teachers/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const teacher = await Teacher.findOne({ username });
        if (!teacher || !(await bcrypt.compare(password, teacher.password))) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }
        res.json({ success: true, username: teacher.username, email: teacher.email });
    } catch (error) {
        console.error("Error in teacher login:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Fetch Teacher Subjects
app.get("/api/teacher/subjects", async (req, res) => {
    try {
        const { username } = req.query;
        const teacher = await Teacher.findOne({ username });
        if (!teacher) {
            return res.status(404).json({ success: false, message: "Teacher not found" });
        }
        res.json({ success: true, subjects: teacher.subjects });
    } catch (error) {
        console.error("Error fetching teacher subjects:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Post Assignment
app.post("/api/assignments/:subject", async (req, res) => {
    try {
        const { subject } = req.params;
        const { title, description, deadline, teacher_username = "teacher2" } = req.body;

        const normalizedSubject = subject.toLowerCase() === "maths" ? "Mathematics" : subject.charAt(0).toUpperCase() + subject.slice(1);
        const teacher = await Teacher.findOne({
            username: teacher_username,
            subjects: { $in: [normalizedSubject] }
        });

        if (!teacher) {
            return res.status(400).json({ success: false, message: "Teacher not assigned to this subject" });
        }
        if (!title || !description || !deadline) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid deadline format" });
        }

        const folderName = sanitizeFolderName(description);
        const folderPath = path.join(__dirname, "..", "frontend", "assignments", folderName);
        fs.mkdirSync(folderPath, { recursive: true });

        const assignment = await Assignment.create({
            teacher_username,
            subject: normalizedSubject,
            title,
            description,
            deadline: deadlineDate,
            folderPath
        });

        res.json({ success: true, message: "Assignment posted successfully!", assignment });
    } catch (error) {
        console.error("Error posting assignment:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// Fetch Assignments by Subject (Fixed Syntax Error)
app.get("/api/assignments/:subject", async (req, res) => {
    try {
        const { subject } = req.params;
        const normalizedSubject = subject.toLowerCase() === "maths" ? "Mathematics" : subject.charAt(0).toUpperCase() + subject.slice(1);
        const assignments = await Assignment.find({ subject: normalizedSubject });
        res.json(assignments);
    } catch (error) {
        console.error("Error fetching assignments:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// Fetch Assignments with Submissions by Subject (For Teachers)
app.get("/api/assignments/:subject/submissions", async (req, res) => {
    try {
        const { subject } = req.params;
        const normalizedSubject = subject.toLowerCase() === "maths" ? "Mathematics" : subject.charAt(0).toUpperCase() + subject.slice(1);
        const assignments = await Assignment.find({ subject: normalizedSubject });
        res.json(assignments);
    } catch (error) {
        console.error("Error fetching assignments with submissions:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// Submit Assignment
app.post("/api/assignments/:subject/submit/:assignmentId", upload.single("file"), async (req, res) => {
    try {
        const { subject, assignmentId } = req.params;
        const { studentUsername } = req.body;

        if (!studentUsername) return res.status(400).json({ success: false, message: "Missing studentUsername" });
        if (!req.file) return res.status(400).json({ success: false, message: "Missing file" });

        const normalizedSubject = subject.toLowerCase() === "maths" ? "Mathematics" : subject.charAt(0).toUpperCase() + subject.slice(1);
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
        if (assignment.subject !== normalizedSubject) return res.status(400).json({ success: false, message: "Subject mismatch" });

        const currentTime = Date.now();
        if (currentTime > new Date(assignment.deadline).getTime()) {
            return res.status(400).json({ success: false, message: "Submission failed: Deadline has passed" });
        }

        const existingSubmission = assignment.submissions.find(sub => sub.studentUsername === studentUsername);
        if (existingSubmission) return res.status(400).json({ success: false, message: "You have already submitted this assignment" });

        const fileUrl = `/assignments/${sanitizeFolderName(assignment.description)}/${req.file.filename}`;
        const submission = {
            studentUsername,
            filePath: req.file.path,
            originalFileName: req.file.originalname,
            submittedAt: new Date()
        };

        assignment.submissions.push(submission);
        await assignment.save();

        res.json({ 
            success: true, 
            message: "Assignment submitted successfully!", 
            fileUrl 
        });
    } catch (error) {
        console.error("Error submitting assignment:", error.stack);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// Forgot Password - Student
app.post("/api/students/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        const student = await Student.findOne({ email });
        if (!student) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const token = crypto.randomBytes(32).toString("hex");
        student.resetToken = token;
        student.resetTokenExpiry = Date.now() + 3600000; // 1 hour
        await student.save();

        const resetLink = `http://localhost:5000/reset-password?token=${token}&email=${email}`;
        const transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: {
                user: "manjunadh2402@gmail.com",
                pass: "nlsk iggp xxfs qepr", // Replace with a valid App Password
            },
        });

        await transporter.sendMail({
            from: "manjunadh2402@gmail.com",
            to: email,
            subject: "Password Reset Request",
            html: `<p>Click <a href="${resetLink}">${resetLink}</a> to reset your password.</p>`,
        });

        res.json({ success: true, message: "Password reset link sent!" });
    } catch (error) {
        console.error("Error in forgot password:", error.stack);
        res.status(500).json({ success: false, message: `Server error: ${error.message}` });
    }
});

// Reset Password - Student
app.get("/reset-password", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "reset-password.html"));
});

app.post("/api/students/reset-password", async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        const student = await Student.findOne({ email });
        if (!student || student.resetToken !== token || Date.now() > student.resetTokenExpiry) {
            return res.status(400).json({ success: false, message: "Invalid or expired token" });
        }

        student.password = await bcrypt.hash(newPassword, 10);
        student.resetToken = undefined;
        student.resetTokenExpiry = undefined;
        await student.save();

        res.json({ success: true, message: "Password changed successfully!" });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Fetch All Assignments for Student's Subjects
app.get("/api/students/assignments", async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) {
            return res.status(400).json({ success: false, message: "Missing username" });
        }

        const student = await Student.findOne({ username });
        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        const subjects = student.subjects;
        const assignments = await Assignment.find({ subject: { $in: subjects } });
        res.json(assignments);
    } catch (error) {
        console.error("Error fetching student assignments:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});