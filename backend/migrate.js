const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/school_db", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Student = mongoose.model("Student", new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  resetToken: String,
  resetTokenExpiry: Date,
  subjects: [String],
}));

const Teacher = mongoose.model("Teacher", new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  subjects: [String],
}));

const Assignment = mongoose.model("Assignment", new mongoose.Schema({
  teacher_username: String,
  subject: String,
  title: String,
  description: String,
  deadline: Date,
  submissions: [{
    studentUsername: String,
    filePath: String,
    submittedAt: { type: Date, default: Date.now }
  }]
}));

async function migrateData() {
  try {
    // Update Students
    await Student.updateMany(
      { subjects: { $exists: false } },
      { $set: { subjects: ["Mathematics", "Physics", "Chemistry"] } }
    );
    console.log("Students updated");

    // Update Teachers
    await Teacher.updateMany(
      { subjects: { $exists: false } },
      { $set: { subjects: ["Mathematics", "Physics", "Chemistry"] } }
    );
    console.log("Teachers updated");

    // Update Assignments (set a default deadline if missing)
    await Assignment.updateMany(
      { deadline: { $exists: false } },
      { $set: { deadline: new Date(), submissions: [] } }
    );
    console.log("Assignments updated");

    mongoose.connection.close();
  } catch (error) {
    console.error("Migration error:", error);
  }
}

migrateData();