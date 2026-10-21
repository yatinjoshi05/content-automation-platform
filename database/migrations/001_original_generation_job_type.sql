-- Migration 001: Register original_generation job type and default generator URL
INSERT INTO job_type_config(job_type, worker_type, webhook_path, heavy, integration, max_attempts)
VALUES ('original_generation', 'original_generation', 'ca-w-original-gen', true, 'original_generator', 3)
ON CONFLICT (job_type) DO UPDATE
SET worker_type = 'original_generation',
    webhook_path = 'ca-w-original-gen',
    heavy = true,
    integration = 'original_generator',
    max_attempts = 3;

INSERT INTO settings(key, value, description)
VALUES ('original_generator_url', '"http://localhost:9200"', 'Base URL for local original video generator service')
ON CONFLICT (key) DO NOTHING;
