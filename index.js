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
    customCss: `
        .swagger-ui { background-color: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #f8fafc !important; font-weight: 700; }
        .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table { color: #cbd5e1 !important; font-size: 14px; }
        .swagger-ui .opblock-tag { color: #f8fafc !important; border-bottom: 1px solid #334155; font-size: 18px; }
        .swagger-ui .opblock .opblock-summary-path { color: #f8fafc !important; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
        .swagger-ui .opblock .opblock-summary-description { color: #94a3b8 !important; }
        .swagger-ui .scheme-container { background: #1e293b !important; box-shadow: none; border: 1px solid #334155; border-radius: 12px; }
        .swagger-ui .opblock { border-radius: 12px; overflow: hidden; border: 1px solid #334155; background: #1e293b !important; }
        .swagger-ui section.models { border: 1px solid #334155; border-radius: 12px; }
        .swagger-ui section.models h4 { color: #f8fafc !important; }
        .swagger-ui .model-box { background: #0f172a !important; }
        .swagger-ui select { background: #334155 !important; color: #f8fafc !important; border: 1px solid #475569; }
        .swagger-ui .btn.authorize { color: #10b981 !important; border-color: #10b981 !important; background: transparent !important; }
        .swagger-ui .btn.authorize svg { fill: #10b981 !important; }
    `,
    customSiteTitle: 'UniPortal API — Interactive Documentation',
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
