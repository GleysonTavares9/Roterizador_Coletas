
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// Import handlers using relative paths
import optimizeFromDbHandler from './optimize-from-db.ts';
import settingsHandler from './settings.ts';
import optimizationsHandler from './optimizations.ts';
import vehiclesHandler from './vehicles.ts';
import clearAssignmentsHandler from './assignments/clear.ts';
import statusHandler from './status.ts';
import resultsHandler from './results.ts';
import reportHandler from './reports/generate.ts';
import generateCalendarHandler from './generate-calendar.ts';
import usersHandler from './users.ts';
import driversHandler from './drivers.ts';
import generateMapHandler from './generate-map.ts';
import driverRoutesHandler from './driver-routes.ts';

// Wrapper to handle async errors
const wrap = (handler: any) => async (req: any, res: any) => {
  try {
    await handler(req, res);
  } catch (err: any) {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
};

// Routes
console.log('Mounting routes...');

app.all('/api/optimize-from-db', wrap(optimizeFromDbHandler));
app.all('/api/settings', wrap(settingsHandler));
app.all('/api/optimizations', wrap(optimizationsHandler));
app.all('/api/vehicles', wrap(vehiclesHandler));
app.all('/api/assignments/clear', wrap(clearAssignmentsHandler));

// Dynamic routes simulation (Vercel rewrites)
app.all('/api/status', wrap(statusHandler));
app.get('/api/status/:id', (req, res) => {
  req.query.id = req.params.id;
  return wrap(statusHandler)(req, res);
});

app.all('/api/results', wrap(resultsHandler));
app.get('/api/results/:id', (req, res) => {
  req.query.id = req.params.id;
  return wrap(resultsHandler)(req, res);
});

app.post('/api/generate-calendar', wrap(generateCalendarHandler));

// Users route - accepting ALL methods
app.all('/api/users', wrap(usersHandler));
app.all('/api/drivers', wrap(driversHandler));

app.get('/api/reports/generate', wrap(reportHandler));
app.all('/api/generate-map', wrap(generateMapHandler));
app.all('/api/driver-routes', wrap(driverRoutesHandler));

app.listen(PORT, () => {
  console.log(`
  🚀 API Development Server running on http://localhost:${PORT}
  
  Endpoints:
  - POST /api/optimize-from-db
  - GET/POST /api/settings
  - GET /api/optimizations
  - GET /api/vehicles
  - DELETE /api/assignments/clear
  - GET /api/status/:id
  - GET /api/results/:id
  - GET/POST/PUT/DELETE /api/users  <-- VERIFIQUE SE ESTA LINHA APARECE
  `);
});
