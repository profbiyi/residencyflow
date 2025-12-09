# backend/seed_db.py
"""
Seed database with SuperAdmin user only
Run this once after first startup: python seed_db.py
"""
from database import SessionLocal, engine, Base
import models
from passlib.context import CryptContext
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_database():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    # Run migrations
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # Add region column if it doesn't exist (PostgreSQL)
            conn.execute(text("""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='connectors' AND column_name='region'
                    ) THEN
                        ALTER TABLE connectors ADD COLUMN region VARCHAR;
                    END IF;
                END $$;
            """))
            conn.commit()
            print("✅ Database migrations applied")
    except Exception as e:
        print(f"⚠️  Migration warning (may be safe to ignore): {e}")
    
    db = SessionLocal()
    
    try:
        # Check if SuperAdmin already exists
        existing = db.query(models.User).filter(models.User.role == "SuperAdmin").first()
        
        if existing:
            print("✅ SuperAdmin already exists")
            print(f"   Email: {existing.email}")
            return
        
        # Create SuperAdmin user
        super_admin = models.User(
            id=str(uuid.uuid4()),
            email="admin@residencyflow.com",
            full_name="Super Admin",
            hashed_password=pwd_context.hash("admin123"),  # Change this password!
            role="SuperAdmin",
            organization_id=None,  # SuperAdmin has no org
            is_active=True
        )
        
        db.add(super_admin)
        db.commit()
        
        print("✅ Database seeded successfully!")
        print("=" * 50)
        print("🔐 SuperAdmin Credentials:")
        print(f"   Email: {super_admin.email}")
        print(f"   Password: admin123")
        print("=" * 50)
        print("⚠️  IMPORTANT: Change this password in production!")
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
