#!/usr/bin/env python3
"""Test login against production database"""
import os
from database import SessionLocal
import models
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

db = SessionLocal()

# Check user exists
email = "superuser@residencyflow.com"
user = db.query(models.User).filter(models.User.email == email).first()

if not user:
    print(f"❌ User {email} not found in database!")
else:
    print(f"✅ User found:")
    print(f"   Email: {user.email}")
    print(f"   Role: {user.role}")
    print(f"   Active: {user.is_active}")
    print(f"   Org ID: {user.organization_id}")
    print(f"   Hash: {user.hashed_password[:50]}...")
    
    # Test password verification
    test_password = input("\nEnter password to test: ")
    if pwd_context.verify(test_password, user.hashed_password):
        print("✅ Password VALID!")
    else:
        print("❌ Password INVALID!")
        
        # Try rehashing with local bcrypt
        print("\n🔧 Rehashing password locally...")
        new_hash = pwd_context.hash(test_password)
        print(f"   New hash: {new_hash[:50]}...")
        
        update = input("\nUpdate database with new hash? (yes/no): ")
        if update.lower() == "yes":
            user.hashed_password = new_hash
            db.commit()
            print("✅ Password updated!")

db.close()
