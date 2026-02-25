const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(morgan('dev'));

// ── Service URL Configuration ─────────────────────────────────────
// These should be set as environment variables in Cloud Run
const SERVICES = {
    STUDENT: process.env.STUDENT_SERVICE_URL || 'http://localhost:5001',
    COURSE: process.env.COURSE_SERVICE_URL || 'http://localhost:5002',
    ENROLLMENT: process.env.ENROLLMENT_SERVICE_URL || 'http://localhost:5003',
    GRADE: process.env.GRADE_SERVICE_URL || 'http://localhost:5004',
};

// ── Proxy Rules ───────────────────────────────────────────────────

// Member 1: Student & Auth Service
app.use(['/api/students', '/api/auth'], createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

// Member 2: Course Service
app.use('/api/courses', createProxyMiddleware({
    target: SERVICES.COURSE,
    changeOrigin: true,
}));

// Member 3: Enrollment Service (YOUR SERVICE)
app.use(['/api/enroll', '/api/enrollments'], createProxyMiddleware({
    target: SERVICES.ENROLLMENT,
    changeOrigin: true,
}));

// Member 4: Grade Service
app.use(['/api/grades', '/api/gpa'], createProxyMiddleware({
    target: SERVICES.GRADE,
    changeOrigin: true,
}));

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'API Gateway is Running' });
});

app.get('/', (req, res) => {
    res.send('<h1>Student Management System API Gateway</h1><p>Use /api-docs on individual services to see documentation.</p>');
});

app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`🔗 Routing:`);
    console.log(`   - /api/students/** -> ${SERVICES.STUDENT}`);
    console.log(`   - /api/courses/**  -> ${SERVICES.COURSE}`);
    console.log(`   - /api/enroll/**   -> ${SERVICES.ENROLLMENT}`);
    console.log(`   - /api/grades/**   -> ${SERVICES.GRADE}`);
});
