#!/usr/bin/env python3
"""
Admin Management CLI
Usage:
  python manage_admin.py create <email> <password>
  python manage_admin.py list
  python manage_admin.py delete <email>
"""
import sys
from database import SessionLocal, Base, engine
import models
from passlib.context import CryptContext
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_tables():
    """Ensure all tables exist"""
    Base.metadata.create_all(bind=engine)

def create_superadmin(email: str, password: str):
    """Create a SuperAdmin user"""
    db = SessionLocal()
    try:
        # Check if user already exists
        existing = db.query(models.User).filter(models.User.email == email).first()
        if existing:
            print(f"❌ User with email {email} already exists!")
            return
        
        # Create SuperAdmin
        admin = models.User(
            id=str(uuid.uuid4()),
            email=email,
            full_name="Super Admin",
            hashed_password=pwd_context.hash(password),
            role="SuperAdmin",
            organization_id=None,
            is_active=True
        )
        
        db.add(admin)
        db.commit()
        
        print("✅ SuperAdmin created successfully!")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print("\n⚠️  Save these credentials securely!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

def list_superadmins():
    """List all SuperAdmin users"""
    db = SessionLocal()
    try:
        admins = db.query(models.User).filter(models.User.role == "SuperAdmin").all()
        
        if not admins:
            print("📭 No SuperAdmin users found")
            return
        
        print("\n🔐 SuperAdmin Users:")
        print("-" * 60)
        for admin in admins:
            print(f"  Email: {admin.email}")
            print(f"  ID: {admin.id}")
            print(f"  Active: {admin.is_active}")
            print("-" * 60)
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

def delete_superadmin(email: str):
    """Delete a SuperAdmin user"""
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(
            models.User.email == email,
            models.User.role == "SuperAdmin"
        ).first()
        
        if not admin:
            print(f"❌ SuperAdmin with email {email} not found")
            return
        
        db.delete(admin)
        db.commit()
        
        print(f"✅ SuperAdmin {email} deleted successfully")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

def main():
    create_tables()
    
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "create":
        if len(sys.argv) != 4:
            print("Usage: python manage_admin.py create <email> <password>")
            sys.exit(1)
        email = sys.argv[2]
        password = sys.argv[3]
        create_superadmin(email, password)
        
    elif command == "list":
        list_superadmins()
        
    elif command == "delete":
        if len(sys.argv) != 3:
            print("Usage: python manage_admin.py delete <email>")
            sys.exit(1)
        email = sys.argv[2]
        delete_superadmin(email)
        
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == "__main__":
    main()
