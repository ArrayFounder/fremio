-- Setup tables for package access system

-- 1. Create frame_packages table
CREATE TABLE IF NOT EXISTS frame_packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    frame_ids TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create user_package_access table
CREATE TABLE IF NOT EXISTS user_package_access (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    package_ids INTEGER[],
    transaction_id UUID,
    access_start TIMESTAMP NOT NULL DEFAULT NOW(),
    access_end TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_user_package_access_user_id ON user_package_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_package_access_end ON user_package_access(access_end);
CREATE INDEX IF NOT EXISTS idx_user_package_access_active ON user_package_access(user_id, is_active, access_end);

-- 4. Insert default frame packages (3 packages)
INSERT INTO frame_packages (name, description, frame_ids, is_active)
VALUES 
    ('Package 1', 'First package with 10 frames', ARRAY[]::TEXT[], TRUE),
    ('Package 2', 'Second package with 10 frames', ARRAY[]::TEXT[], TRUE),
    ('Package 3', 'Third package with 10 frames', ARRAY[]::TEXT[], TRUE)
ON CONFLICT DO NOTHING;

-- 5. Create deactivate function
CREATE OR REPLACE FUNCTION deactivate_expired_access()
RETURNS void AS $$
BEGIN
  UPDATE user_package_access
  SET is_active = FALSE
  WHERE is_active = TRUE
    AND access_end <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Show results
SELECT 'frame_packages created' as status, COUNT(*) as count FROM frame_packages;
SELECT 'user_package_access table ready' as status;
