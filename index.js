const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(morgan('dev'));

// ── Swagger API Documentation ─────────────────────────────────────
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui { background-color: #1a1a2e; } .swagger-ui .topbar { display: none; }',
    customSiteTitle: 'Student Management System — API Docs',
}));

// ── Service URL Configuration ─────────────────────────────────────
const SERVICES = {
    STUDENT: process.env.STUDENT_SERVICE_URL || 'http://localhost:5001',
    COURSE: process.env.COURSE_SERVICE_URL || 'http://localhost:5002',
    ENROLLMENT: process.env.ENROLLMENT_SERVICE_URL || 'http://localhost:5003',
    GRADE: process.env.GRADE_SERVICE_URL || 'http://localhost:5004',
};

// ── Proxy Rules (API Gateway owns /api prefix) ───────────────────
// We mount proxies at /api so Express strips the prefix before forwarding.
// This follows the clean architecture rule: individual services should not care about /api.

// Member 1: Student & Auth Service
app.use('/api', createProxyMiddleware({
    pathFilter: ['/students', '/auth'],
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

// Member 2: Course Service
app.use('/api', createProxyMiddleware({
    pathFilter: '/courses',
    target: SERVICES.COURSE,
    changeOrigin: true,
}));

// Member 3: Enrollment Service (YOUR SERVICE)
app.use('/api', createProxyMiddleware({
    pathFilter: ['/enrollments', '/enroll'],
    target: SERVICES.ENROLLMENT,
    changeOrigin: true,
}));

// Member 4: Grade Service
app.use('/api', createProxyMiddleware({
    pathFilter: ['/grades', '/gpa'],
    target: SERVICES.GRADE,
    changeOrigin: true,
}));

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'API Gateway is Running' });
});

app.get('/', (req, res) => {
    res.send('<h1>Student Management System API Gateway</h1><p>Visit <a href="/api-docs">/api-docs</a> for interactive API documentation.</p>');
});

app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`🔗 Routing:`);
    console.log(`   - /api/students/** -> ${SERVICES.STUDENT}`);
    console.log(`   - /api/courses/**  -> ${SERVICES.COURSE}`);
    console.log(`   - /api/enroll/**   -> ${SERVICES.ENROLLMENT}`);
    console.log(`   - /api/grades/**   -> ${SERVICES.GRADE}`);
});
