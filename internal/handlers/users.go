package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"coresdashboard/internal/microsoft"

	commonjwt "github.com/nbt4/cores-common/pkg/jwt"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UsersHandler struct {
	db *gorm.DB
	ms *microsoft.Service
}

func NewUsersHandler(db *gorm.DB, ms *microsoft.Service) *UsersHandler {
	return &UsersHandler{db: db, ms: ms}
}

type adminUser struct {
	UserID              uint       `json:"userID"`
	Username            string     `json:"username"`
	Email               string     `json:"email"`
	FirstName           string     `json:"firstName"`
	LastName            string     `json:"lastName"`
	DisplayName         string     `json:"displayName"`
	IsAdmin             bool       `json:"isAdmin"`
	IsActive            bool       `json:"isActive"`
	ForcePasswordChange bool       `json:"forcePasswordChange"`
	IdentitySource      string     `json:"identitySource"`
	ExternalID          string     `json:"externalId,omitempty"`
	UserPrincipalName   string     `json:"userPrincipalName,omitempty"`
	JobTitle            string     `json:"jobTitle,omitempty"`
	Department          string     `json:"department,omitempty"`
	OfficeLocation      string     `json:"officeLocation,omitempty"`
	MobilePhone         string     `json:"mobilePhone,omitempty"`
	CreatedAt           time.Time  `json:"createdAt"`
	LastLogin           *time.Time `json:"lastLogin,omitempty"`
	LastSyncedAt        *time.Time `json:"lastSyncedAt,omitempty"`
}

type userRequest struct {
	Username            string `json:"username"`
	Email               string `json:"email"`
	Password            string `json:"password"`
	FirstName           string `json:"firstName"`
	LastName            string `json:"lastName"`
	DisplayName         string `json:"displayName"`
	IsAdmin             bool   `json:"isAdmin"`
	IsActive            bool   `json:"isActive"`
	ForcePasswordChange bool   `json:"forcePasswordChange"`
}

func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	var users []adminUser
	err := h.db.WithContext(r.Context()).Raw(`
		SELECT u.userid AS user_id, u.username, u.email, COALESCE(u.first_name, '') AS first_name,
			COALESCE(u.last_name, '') AS last_name,
			COALESCE(NULLIF(p.display_name, ''), NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username) AS display_name,
			u.is_admin, u.is_active, u.force_password_change,
			COALESCE(u.identity_source, 'local') AS identity_source, COALESCE(u.external_id, '') AS external_id,
			COALESCE(mp.user_principal_name, '') AS user_principal_name, COALESCE(mp.job_title, '') AS job_title,
			COALESCE(mp.department, '') AS department, COALESCE(mp.office_location, '') AS office_location,
			COALESCE(mp.mobile_phone, '') AS mobile_phone, u.created_at, u.last_login, mp.last_synced_at
		FROM users u
		LEFT JOIN user_profiles p ON p.user_id = u.userid
		LEFT JOIN microsoft_user_profiles mp ON mp.user_id = u.userid
		ORDER BY display_name ASC, u.username ASC`).Scan(&users).Error
	if err != nil {
		jsonError(w, "Benutzer konnten nicht geladen werden", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "total": len(users)})
}

func (h *UsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	settings, err := h.ms.GetSettings(r.Context())
	if err != nil {
		jsonError(w, "Benutzerquelle konnte nicht gelesen werden", http.StatusInternalServerError)
		return
	}
	if settings.UserMode == "microsoft" {
		jsonError(w, "Im Microsoft-Modus werden Benutzer ausschließlich in Entra angelegt", http.StatusConflict)
		return
	}
	var req userRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Email) == "" || req.Password == "" {
		jsonError(w, "Benutzername, E-Mail und Passwort sind Pflichtfelder", http.StatusBadRequest)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "Passwort konnte nicht verarbeitet werden", http.StatusInternalServerError)
		return
	}
	err = h.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		row := map[string]any{
			"username": strings.TrimSpace(req.Username), "email": strings.TrimSpace(req.Email),
			"password_hash": string(hash), "first_name": strings.TrimSpace(req.FirstName), "last_name": strings.TrimSpace(req.LastName),
			"is_admin": req.IsAdmin, "is_active": req.IsActive, "force_password_change": req.ForcePasswordChange,
			"identity_source": "local", "created_at": time.Now(), "updated_at": time.Now(),
		}
		if err := tx.Table("users").Create(row).Error; err != nil {
			return err
		}
		var userID uint
		if err := tx.Table("users").Select("userid").Where("username = ?", strings.TrimSpace(req.Username)).Scan(&userID).Error; err != nil {
			return err
		}
		displayName := preferredDisplayName(req)
		return tx.Exec(`INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
			VALUES (?, ?, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=NOW()`, userID, displayName).Error
	})
	if err != nil {
		jsonError(w, "Benutzername oder E-Mail ist bereits vergeben", http.StatusConflict)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"message": "Benutzer angelegt"})
}

func (h *UsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, err := userIDFromPath(r.URL.Path)
	if err != nil {
		jsonError(w, "Ungültige Benutzer-ID", http.StatusBadRequest)
		return
	}
	var source string
	if err := h.db.WithContext(r.Context()).Table("users").Select("COALESCE(identity_source, 'local')").Where("userid = ?", userID).Scan(&source).Error; err != nil || source == "" {
		jsonError(w, "Benutzer nicht gefunden", http.StatusNotFound)
		return
	}
	if source == "microsoft" {
		jsonError(w, "Microsoft-Stammdaten sind schreibgeschützt; Rollen können im Bereich Rollen angepasst werden", http.StatusConflict)
		return
	}
	var req userRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Email) == "" {
		jsonError(w, "Benutzername und E-Mail sind Pflichtfelder", http.StatusBadRequest)
		return
	}
	err = h.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{
			"username": strings.TrimSpace(req.Username), "email": strings.TrimSpace(req.Email),
			"first_name": strings.TrimSpace(req.FirstName), "last_name": strings.TrimSpace(req.LastName),
			"is_admin": req.IsAdmin, "is_active": req.IsActive,
			"force_password_change": req.ForcePasswordChange, "updated_at": time.Now(),
		}
		if req.Password != "" {
			hash, hashErr := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if hashErr != nil {
				return hashErr
			}
			updates["password_hash"] = string(hash)
		}
		if err := tx.Table("users").Where("userid = ?", userID).Updates(updates).Error; err != nil {
			return err
		}
		return tx.Exec(`INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
			VALUES (?, ?, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=NOW()`, userID, preferredDisplayName(req)).Error
	})
	if err != nil {
		jsonError(w, "Benutzername oder E-Mail ist bereits vergeben", http.StatusConflict)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Benutzer aktualisiert"})
}

// UpdateAccess changes Cores-owned authorization data without touching identity
// fields. This is deliberately available for both local and Microsoft users.
func (h *UsersHandler) UpdateAccess(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSuffix(strings.TrimRight(r.URL.Path, "/"), "/access")
	userID, err := userIDFromPath(path)
	if err != nil {
		jsonError(w, "Ungültige Benutzer-ID", http.StatusBadRequest)
		return
	}
	var req struct {
		IsAdmin bool `json:"isAdmin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
		return
	}
	if claims, ok := commonjwt.GetClaims(r); ok && claims.UserID == userID && !req.IsAdmin {
		jsonError(w, "Das eigene Administratorrecht kann nicht entzogen werden", http.StatusBadRequest)
		return
	}
	result := h.db.WithContext(r.Context()).Table("users").Where("userid = ?", userID).Updates(map[string]any{
		"is_admin": req.IsAdmin, "updated_at": time.Now(),
	})
	if result.Error != nil {
		jsonError(w, "Cores-Zugriffsrechte konnten nicht aktualisiert werden", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		jsonError(w, "Benutzer nicht gefunden", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Cores-Zugriffsrechte aktualisiert"})
}

func (h *UsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, err := userIDFromPath(r.URL.Path)
	if err != nil {
		jsonError(w, "Ungültige Benutzer-ID", http.StatusBadRequest)
		return
	}
	if claims, ok := commonjwt.GetClaims(r); ok && claims.UserID == userID {
		jsonError(w, "Das eigene Benutzerkonto kann nicht gelöscht werden", http.StatusBadRequest)
		return
	}
	var source string
	h.db.WithContext(r.Context()).Table("users").Select("COALESCE(identity_source, 'local')").Where("userid = ?", userID).Scan(&source)
	if source == "microsoft" {
		jsonError(w, "Microsoft-Benutzer werden über die Entra-Gruppe entfernt", http.StatusConflict)
		return
	}
	result := h.db.WithContext(r.Context()).Exec("DELETE FROM users WHERE userid = ?", userID)
	if result.Error != nil {
		jsonError(w, "Benutzer konnte nicht gelöscht werden", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected == 0 {
		jsonError(w, "Benutzer nicht gefunden", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Benutzer gelöscht"})
}

func preferredDisplayName(req userRequest) string {
	if value := strings.TrimSpace(req.DisplayName); value != "" {
		return value
	}
	if value := strings.TrimSpace(req.FirstName + " " + req.LastName); value != "" {
		return value
	}
	return strings.TrimSpace(req.Username)
}

func userIDFromPath(path string) (uint, error) {
	value := strings.Trim(strings.TrimPrefix(path, "/api/v1/admin/users/"), "/")
	id, err := strconv.ParseUint(value, 10, 32)
	return uint(id), err
}
