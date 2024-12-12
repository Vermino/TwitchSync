import fs from 'fs';
import path from 'path';

const baseDir = path.join(__dirname, '..');

const directories = [
  'src/utils',
  'src/routes',
  'src/config',
  'src/services',
  'src/types',
  'scripts',
  'migrations'
];

function createDirectory(dir: string) {
  const fullPath = path.join(baseDir, dir);
  if (!fs.existsSync(fullPath)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(fullPath, { recursive: true });
  } else {
    console.log(`Directory exists: ${dir}`);
  }
}

function setupDirectories() {
  console.log('Setting up directory structure...');

  for (const dir of directories) {
    createDirectory(dir);
  }

  console.log('Directory setup complete!');
}

function createLogger() {
  const loggerPath = path.join(baseDir, 'src', 'utils', 'logger.ts');
  if (!fs.existsSync(loggerPath)) {
    console.log('Creating logger utility...');
    const loggerContent = `
import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  );
}

export default logger;
`;
    fs.writeFileSync(loggerPath, loggerContent);
    console.log('Logger utility created!');
  }
}

// Run setup
try {
  setupDirectories();
  createLogger();
  console.log('Setup completed successfully!');
} catch (error) {
  console.error('Setup failed:', error);
  process.exit(1);
}
