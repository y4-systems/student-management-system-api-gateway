const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// ── JWT Verification Middleware ───────────────────────────────────
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
};

// Redirection fix for Swagger UI
app.get('/api-docs', (req, res, next) => {
    if (!req.url.endsWith('/')) {
        return res.redirect(301, '/api-docs/');
    }
    next();
});

const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: `
        .swagger-ui { background-color: #0b0f1a; color: #ffffff; font-family: 'Inter', system-ui, sans-serif; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #ffffff !important; font-weight: 800; letter-spacing: -0.025em; }
        .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table { color: #e2e8f0 !important; font-size: 15px; line-height: 1.6; }
        .swagger-ui .opblock-tag { color: #ffffff !important; border-bottom: 2px solid #1e293b; font-size: 20px; font-weight: 700; margin: 24px 0 16px; }
        .swagger-ui .opblock .opblock-summary-path { color: #ffffff !important; font-weight: 600; font-family: 'Fira Code', 'JetBrains Mono', monospace; font-size: 16px; }
        .swagger-ui .opblock .opblock-summary-description { color: #cbd5e1 !important; font-weight: 500; }
        .swagger-ui .scheme-container { background: #1a1f2e !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #2d3748; border-radius: 16px; margin: 20px 0; padding: 20px; }
        .swagger-ui .opblock { border-radius: 16px; overflow: hidden; border: 1px solid #2d3748; background: #1a1f2e !important; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 12px; }
        .swagger-ui section.models { border: 1px solid #2d3748; border-radius: 16px; margin-top: 40px; }
        .swagger-ui section.models h4 { color: #ffffff !important; font-weight: 700; }
        .swagger-ui .model-box { background: #0b0f1a !important; border-radius: 8px; }
        .swagger-ui select { background: #2d3748 !important; color: #ffffff !important; border: 1px solid #4a5568; border-radius: 8px; padding: 4px 8px; }
        .swagger-ui .btn.authorize { color: #00ff9d !important; border-color: #00ff9d !important; background: rgba(0,255,157,0.1) !important; font-weight: 700; border-radius: 8px; transition: all 0.2s; }
        .swagger-ui .btn.authorize:hover { background: rgba(0,255,157,0.2) !important; }
        .swagger-ui .btn.authorize svg { fill: #00ff9d !important; }
        .swagger-ui .opblock-summary { padding: 12px 16px; }
        .swagger-ui .parameter__name { color: #ffffff !important; font-weight: 600; }
        .swagger-ui .parameter__type { color: #a0aec0 !important; }
    `,
    customSiteTitle: 'UniPortal API Documentation',
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

// Public auth routes (no JWT required)
app.use('/api/auth/login', createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

app.use('/api/auth/register', createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

// Protected auth routes (JWT required)
app.use('/api/auth/validate', verifyJWT, createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

app.use('/api/auth', verifyJWT, createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

// Member 1: Student Service (authenticated)
app.use('/api/students', verifyJWT, createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
}));

// Member 2: Course Service 
// GET /api/courses is public, POST/PUT/DELETE require JWT
app.use('/api/courses', createProxyMiddleware({
    target: SERVICES.COURSE,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Check if it's a write operation (POST, PUT, DELETE, PATCH)
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({ message: 'Access token required for this operation' });
            }
            
            jwt.verify(token, JWT_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(403).json({ message: 'Invalid or expired token' });
                }
                // Add user info to proxy request headers
                proxyReq.setHeader('X-User-ID', decoded.id || decoded.sub);
            });
        }
    },
}));

// Member 3: Enrollment Service (authenticated)
app.use('/api/enrollments', verifyJWT, createProxyMiddleware({
    target: SERVICES.ENROLLMENT,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('X-User-ID', req.user.id || req.user.sub);
    },
}));

app.use('/api/enroll', verifyJWT, createProxyMiddleware({
    target: SERVICES.ENROLLMENT,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('X-User-ID', req.user.id || req.user.sub);
    },
}));

// Member 4: Grade Service (authenticated)
app.use('/api/grades', verifyJWT, createProxyMiddleware({
    target: SERVICES.GRADE,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('X-User-ID', req.user.id || req.user.sub);
    },
}));

app.use('/api/gpa', verifyJWT, createProxyMiddleware({
    target: SERVICES.GRADE,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('X-User-ID', req.user.id || req.user.sub);
    },
}));

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'API Gateway is Running' });
});

// ── Token Generation (for testing/internal use) ────────────────────
app.post('/api/token/generate', (req, res) => {
    const { userId, email, role } = req.body;
    
    if (!userId || !email) {
        return res.status(400).json({ message: 'userId and email are required' });
    }

    const token = jwt.sign(
        { id: userId, email, role: role || 'student' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({ token, expiresIn: '24h' });
});

app.get('/', (req, res) => {
    res.send('<h1>Student Management System API Gateway</h1><p>Visit <a href="/api-docs">/api-docs</a> for interactive API documentation.</p>');
});

app.listen(PORT, () => {
    console.log(`🚀 API Gateway running on port ${PORT}`);
    console.log(`🔗 Routing:`);
    console.log(`   - /api/students/** -> ${SERVICES.STUDENT} (JWT Required)`);
    console.log(`   - /api/courses/**  -> ${SERVICES.COURSE} (Write operations require JWT)`);
    console.log(`   - /api/enroll/**   -> ${SERVICES.ENROLLMENT} (JWT Required)`);
    console.log(`   - /api/grades/**   -> ${SERVICES.GRADE} (JWT Required)`);
    console.log(`🔐 JWT Authentication: ${JWT_SECRET === 'your-secret-key-change-this-in-production' ? '⚠️  USING DEFAULT SECRET (CHANGE IN PRODUCTION)' : '✅ Configured'}`);
});
