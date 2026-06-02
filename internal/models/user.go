package models

import "time"

type User struct {
	UserID        uint      `gorm:"column:userid;primaryKey"`
	Username      string    `gorm:"column:username"`
	PasswordHash  string    `gorm:"column:password_hash"`
	Email         string    `gorm:"column:email"`
	IsActive      bool      `gorm:"column:is_active"`
	IsAdmin       bool      `gorm:"column:is_admin"`
	ForcePassword bool      `gorm:"column:force_password_change"`
	CreatedAt     time.Time `gorm:"column:created_at"`
}

func (User) TableName() string { return "users" }
