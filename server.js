const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MySQL Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "adithya",
  password: "adithya@123",
  database: "school_db",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
  } else {
    console.log("Connected to MySQL database");
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// ✅ Student Registration (Request for Approval)
// Student Registration - Sends request to teacher
app.post("/api/students/register", (req, res) => {
  const { username, email, password } = req.body;

  // Check if student already requested
  const checkSql = "SELECT * FROM student_requests WHERE email = ?";
  db.query(checkSql, [email], (err, results) => {
      if (err) return res.status(500).json({ success: false, message: "Database error" });

      if (results.length > 0) {
          return res.status(400).json({ success: false, message: "Request already pending!" });
      }

      // Insert student request into student_requests table
      const insertSql = "INSERT INTO student_requests (username, email, password) VALUES (?, ?, ?)";
      db.query(insertSql, [username, email, password], (err, result) => {
          if (err) return res.status(500).json({ success: false, message: "Error registering student" });
          res.json({ success: true, message: "Student request sent for approval" });
      });
  });
});
// Get pending student requests
app.get("/api/students/requests", (req, res) => {
  const sql = "SELECT * FROM student_requests";
  db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ success: false, message: "Database error" });
      res.json(results);
  });
});

// Approve student registration
app.post("/api/students/approve", (req, res) => {
  const { id, username, email, password } = req.body;

  // Insert student into students table
  const insertSql = "INSERT INTO students (username, email, password) VALUES (?, ?, ?)";
  db.query(insertSql, [username, email, password], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "Error approving student" });

      // Delete request after approval
      const deleteSql = "DELETE FROM student_requests WHERE id = ?";
      db.query(deleteSql, [id], (err, result) => {
          if (err) return res.status(500).json({ success: false, message: "Error removing request" });
          res.json({ success: true, message: "Student approved!" });
      });
  });
});


// ✅ Teacher Fetches Pending Student Requests
app.get("/api/teachers/pending-students", (req, res) => {
  const query = "SELECT * FROM student_requests WHERE status = 'pending'";
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    res.json({ success: true, requests: results });
  });
});

// ✅ Teacher Approves a Student
app.post("/api/teachers/approve-student", (req, res) => {
  const { id } = req.body;

  const fetchQuery = "SELECT * FROM student_requests WHERE id = ?";
  db.query(fetchQuery, [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Student request not found" });
    }

    const { username, email, password } = results[0];

    // Insert into students table
    const insertQuery = "INSERT INTO students (username, email, password) VALUES (?, ?, ?)";
    db.query(insertQuery, [username, email, password], (err) => {
      if (err) return res.status(500).json({ success: false, message: "Database error" });

      // Delete from student_requests table
      const deleteQuery = "DELETE FROM student_requests WHERE id = ?";
      db.query(deleteQuery, [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });

        res.json({ success: true, message: "Student approved and added to database" });
      });
    });
  });
});

// ✅ Teacher Rejects a Student
app.post("/api/teachers/reject-student", (req, res) => {
  const { id } = req.body;

  const deleteQuery = "DELETE FROM student_requests WHERE id = ?";
  db.query(deleteQuery, [id], (err) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });

    res.json({ success: true, message: "Student request rejected" });
  });
});

// ✅ Student Login
app.post("/api/students/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Missing username or password" });
  }
  const query = "SELECT username, email FROM students WHERE username = ? AND password = ?";
  db.query(query, [username, password], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (results.length > 0) {
      res.json({ success: true, ...results[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });
});

// ✅ Teacher Login
app.post("/api/teachers/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Missing username or password" });
  }
  const sql = "SELECT username, email FROM teachers WHERE username = ? AND password = ?";
  db.query(sql, [username, password], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (results.length > 0) {
      res.json({ success: true, ...results[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  });
});

// ✅ Teacher posts an assignment
app.post("/api/assignments", (req, res) => {
  const { teacher_username, subject, title, description } = req.body;
  if (!teacher_username || !subject || !title || !description) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }
  const sql = "INSERT INTO assignments (teacher_username, subject, title, description) VALUES (?, ?, ?, ?)";
  db.query(sql, [teacher_username, subject, title, description], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    res.json({ success: true, message: "Assignment posted successfully" });
  });
});

// ✅ Student fetches assignments based on enrolled subjects
app.get("/api/students/:username/assignments", (req, res) => {
  const { username } = req.params;
  const sql = `SELECT a.* FROM assignments a 
               JOIN student_enrollments se ON a.subject = se.subject 
               WHERE se.student_username = ?`;
  db.query(sql, [username], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    res.json({ success: true, assignments: results });
  });
});

// ✅ Forgot Password - Student
app.post("/api/students/forgot-password", (req, res) => {
  const { email, username, newPassword } = req.body;

  if (!email || !username || !newPassword) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  const updateQuery = "UPDATE students SET password = ? WHERE email = ? AND username = ?";
  db.query(updateQuery, [newPassword, email, username], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });

    res.json({ success: true, message: "Password reset successfully" });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
