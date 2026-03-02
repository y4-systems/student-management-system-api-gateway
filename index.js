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
// express.json() removed globally to ensure body streams are preserved for proxies.


// ── Utility Functions ──────────────────────────────────────────────
const normalizeBaseUrl = (url) => String(url || '').replace(/\/+$/, '');
const isWriteMethod = (method) => ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
const DEFAULT_PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 30000);


const normalizeRole = (role) => {
    return typeof role === 'string' ? role.trim().toLowerCase() : '';
};


const forwardJsonBody = (proxyReq, req) => {
    if (!isWriteMethod(req.method)) return;
    if (!req.body || typeof req.body !== 'object') return;
    if (Object.keys(req.body).length === 0) return;

    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
    proxyReq.end();
};

const applyUserContextHeaders = (proxyReq, req) => {
    if (!req.user) return;
    const userId = req.user.id || req.user.sub;
    const role = normalizeRole(req.user.role);

    if (userId) {
        proxyReq.setHeader('X-User-ID', userId);
    }
    if (role) {
        proxyReq.setHeader('X-User-Role', role);
    }

};

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

// ── Role-Based Authorization Middleware ────────────────────────────
const requireRoles = (...allowedRoles) => {
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Access token required' });
        }
        const role = normalizeRole(req.user.role);
        if (!normalizedAllowedRoles.includes(role)) {
            return res.status(403).json({
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
            });
        }
        next();
    };
};

const requireRolesForMethods = (methods, ...roles) => {
    const normalizedMethods = methods.map((method) => method.toUpperCase());
    const roleMiddleware = requireRoles(...roles);
    return (req, res, next) => {
        if (!normalizedMethods.includes(req.method.toUpperCase())) {
            return next();
        }
        return roleMiddleware(req, res, next);
    };
};


const requireJWTForWrite = (req, res, next) => {
    if (!isWriteMethod(req.method)) return next();
    return verifyJWT(req, res, next);
};


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

// ── Service URL Configuration ──────────────────────────────────────
const SERVICES = {
    STUDENT: normalizeBaseUrl(process.env.STUDENT_SERVICE_URL || 'http://localhost:5001'),
    COURSE: normalizeBaseUrl(process.env.COURSE_SERVICE_URL || 'http://localhost:5002'),
    ENROLLMENT: normalizeBaseUrl(process.env.ENROLLMENT_SERVICE_URL || 'http://localhost:5003'),
    GRADE: normalizeBaseUrl(process.env.GRADE_SERVICE_URL || 'http://localhost:5004'),
};

const toBasePath = (basePath, path) => {
    if (path === '/' || path === '') return basePath;
    return `${basePath}${path}`;
};

// ── Proxy Middleware Instances ─────────────────────────────────────
const studentAuthProxy = createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: () => '/auth/login',
    onProxyReq: (proxyReq, req) => {
        forwardJsonBody(proxyReq, req);
    },
});

const studentRegisterProxy = createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: () => '/auth/register',
    onProxyReq: (proxyReq, req) => {
        forwardJsonBody(proxyReq, req);
    },
});

const studentValidateProxy = createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: () => '/auth/validate',
});

const studentDataProxy = createProxyMiddleware({
    target: SERVICES.STUDENT,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: (path) => toBasePath('/students', path),
    onProxyReq: (proxyReq, req) => {
        forwardJsonBody(proxyReq, req);
        applyUserContextHeaders(proxyReq, req);
    },
});

const courseProxy = createProxyMiddleware({
    target: SERVICES.COURSE,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: (path) => toBasePath('/courses', path),
    onProxyReq: (proxyReq, req) => {
        forwardJsonBody(proxyReq, req);
        applyUserContextHeaders(proxyReq, req);
    },
});

const enrollmentsProxy = createProxyMiddleware({
    target: SERVICES.ENROLLMENT,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: (path) => toBasePath('/enrollments', path),
    onProxyReq: (proxyReq, req) => {
        applyUserContextHeaders(proxyReq, req);
        forwardJsonBody(proxyReq, req);
    },
});

const enrollProxy = createProxyMiddleware({
    target: SERVICES.ENROLLMENT,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: (path) => toBasePath('/enroll', path),
    onProxyReq: (proxyReq, req) => {
        applyUserContextHeaders(proxyReq, req);
        forwardJsonBody(proxyReq, req);
    },
});

const gradesProxy = createProxyMiddleware({
    target: SERVICES.GRADE,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: (path) => toBasePath('/grades', path),
    onProxyReq: (proxyReq, req) => {
        applyUserContextHeaders(proxyReq, req);
        forwardJsonBody(proxyReq, req);
    },
});

const gpaProxy = createProxyMiddleware({
    target: SERVICES.GRADE,
    changeOrigin: true,
    proxyTimeout: DEFAULT_PROXY_TIMEOUT_MS,
    timeout: DEFAULT_PROXY_TIMEOUT_MS,
    pathRewrite: (path) => toBasePath('/gpa', path),
    onProxyReq: (proxyReq, req) => {
        applyUserContextHeaders(proxyReq, req);
        forwardJsonBody(proxyReq, req);
    },
});

// ── Route Handlers with Role-Based Access Control ────────────────────

// Auth routes
app.use(['/api/auth/login', '/auth/login'], studentAuthProxy);
app.use(['/api/auth/register', '/auth/register'], studentRegisterProxy);
app.use(['/api/auth/validate', '/auth/validate'], verifyJWT, studentValidateProxy);

// Student routes (JWT + admin/student)
app.use(['/api/students', '/students'], verifyJWT, requireRoles('admin', 'student'), studentDataProxy);

// Course routes (public read, admin write)
app.use(['/api/courses', '/courses'], (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
        return next();
    }

    return verifyJWT(req, res, () => requireRoles('admin')(req, res, next));
}, courseProxy);

// Enrollment routes (JWT + admin/student)
app.use(['/api/enrollments', '/enrollments'], verifyJWT, requireRoles('admin', 'student'), enrollmentsProxy);
app.use(['/api/enroll', '/enroll'], verifyJWT, requireRoles('admin', 'student'), enrollProxy);

// Grade routes (JWT + admin/student for read, admin only for write)
app.use(['/api/grades', '/grades'], verifyJWT, requireRoles('admin', 'student'), requireRolesForMethods(['POST', 'PUT', 'DELETE', 'PATCH'], 'admin'), gradesProxy);
app.use(['/api/gpa', '/gpa'], verifyJWT, requireRoles('admin', 'student'), gpaProxy);

// ── Health Check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'API Gateway is Running' });

});

// Token Generation (Internal/Testing) - Needs express.json()
app.post('/api/token/generate', express.json(), (req, res) => {
    const { userId, email, role } = req.body;
    const normalizedRole = normalizeRole(role || 'student');
    const allowedRoles = ['admin', 'student'];

    if (!userId || !email) {
        return res.status(400).json({ message: 'userId and email are required' });
    }

    if (!allowedRoles.includes(normalizedRole)) {
        return res.status(400).json({
            message: `role must be one of: ${allowedRoles.join(', ')}`,
        });
    }

    const token = jwt.sign(
        { id: userId, email, role: normalizedRole },
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
    console.log(`   - /api/students/** -> ${SERVICES.STUDENT} (JWT + role: admin|student)`);
    console.log(`   - /api/courses/**  -> ${SERVICES.COURSE} (Public read, admin write)`);
    console.log(`   - /api/enroll**/** -> ${SERVICES.ENROLLMENT} (JWT + role: admin|student)`);
    console.log(`   - /api/grades/**   -> ${SERVICES.GRADE} (JWT + role: admin|student, admin write)`);
    console.log(`🔐 JWT Authentication: ${JWT_SECRET === 'your-secret-key-change-this-in-production' ? '⚠️  USING DEFAULT SECRET (CHANGE IN PRODUCTION)' : '✅ Configured'}`);

    if (JWT_SECRET === 'your-secret-key-change-this-in-production') {
        console.warn('JWT_SECRET is default. Set the same strong JWT_SECRET in both Gateway and Student Service.');
    }

});
