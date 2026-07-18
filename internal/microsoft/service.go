package microsoft

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

const maskedSecret = "••••••••"

type Settings struct {
	ID                      uint       `gorm:"primaryKey;column:id" json:"id"`
	TenantID                string     `gorm:"column:tenant_id" json:"tenantId"`
	ClientID                string     `gorm:"column:client_id" json:"clientId"`
	ClientSecret            string     `gorm:"column:client_secret" json:"clientSecret"`
	MailboxID               string     `gorm:"column:mailbox_id" json:"mailboxId"`
	SyncInterval            string     `gorm:"column:sync_interval" json:"syncInterval"`
	CalendarMailbox         string     `gorm:"column:calendar_mailbox" json:"calendarMailbox"`
	AppBaseURL              string     `gorm:"column:app_base_url" json:"appBaseUrl"`
	UserMode                string     `gorm:"column:user_mode" json:"userMode"`
	UserSyncEnabled         bool       `gorm:"column:user_sync_enabled" json:"userSyncEnabled"`
	UserGroupID             string     `gorm:"column:user_group_id" json:"userGroupId"`
	UserSyncIntervalMinutes int        `gorm:"column:user_sync_interval_minutes" json:"userSyncIntervalMinutes"`
	DisableRemovedUsers     bool       `gorm:"column:disable_removed_users" json:"disableRemovedUsers"`
	MicrosoftLoginEnabled   bool       `gorm:"column:microsoft_login_enabled" json:"microsoftLoginEnabled"`
	LastUserSyncAt          *time.Time `gorm:"column:last_user_sync_at" json:"lastUserSyncAt"`
	LastUserSyncStatus      string     `gorm:"column:last_user_sync_status" json:"lastUserSyncStatus"`
	LastUserSyncError       string     `gorm:"column:last_user_sync_error" json:"lastUserSyncError"`
	LastUserSyncCount       int        `gorm:"column:last_user_sync_count" json:"lastUserSyncCount"`
	UpdatedAt               time.Time  `gorm:"column:updated_at" json:"updatedAt"`
}

func (Settings) TableName() string { return "m365_settings" }

func (s Settings) Masked() Settings {
	if s.ClientSecret != "" {
		s.ClientSecret = maskedSecret
	}
	return s
}

func (s Settings) UsesLocalLogin() bool {
	return s.UserMode == "" || s.UserMode == "local" || s.UserMode == "hybrid"
}

func (s Settings) UsesMicrosoftLogin() bool {
	return (s.UserMode == "microsoft" || s.UserMode == "hybrid") && s.MicrosoftLoginEnabled
}

type DirectoryUser struct {
	ID                string   `json:"id"`
	DisplayName       string   `json:"displayName"`
	GivenName         string   `json:"givenName"`
	Surname           string   `json:"surname"`
	Mail              string   `json:"mail"`
	UserPrincipalName string   `json:"userPrincipalName"`
	AccountEnabled    *bool    `json:"accountEnabled"`
	JobTitle          string   `json:"jobTitle"`
	Department        string   `json:"department"`
	OfficeLocation    string   `json:"officeLocation"`
	BusinessPhones    []string `json:"businessPhones"`
	MobilePhone       string   `json:"mobilePhone"`
	PreferredLanguage string   `json:"preferredLanguage"`
}

type graphPage struct {
	Value    []DirectoryUser `json:"value"`
	NextLink string          `json:"@odata.nextLink"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	Error       string `json:"error"`
	Description string `json:"error_description"`
}

type SyncResult struct {
	Imported int      `json:"imported"`
	Updated  int      `json:"updated"`
	Disabled int      `json:"disabled"`
	Skipped  int      `json:"skipped"`
	Warnings []string `json:"warnings,omitempty"`
}

type Service struct {
	db         *gorm.DB
	httpClient *http.Client
	mu         sync.Mutex
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db, httpClient: &http.Client{Timeout: 30 * time.Second}}
}

func EnsureSchema(db *gorm.DB) error {
	statements := []string{
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_source VARCHAR(20) NOT NULL DEFAULT 'local'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(128)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id) WHERE external_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_users_identity_source ON users(identity_source)`,
		`CREATE TABLE IF NOT EXISTS m365_settings (
			id SERIAL PRIMARY KEY,
			tenant_id VARCHAR(128) NOT NULL DEFAULT '', client_id VARCHAR(128) NOT NULL DEFAULT '',
			client_secret TEXT NOT NULL DEFAULT '', mailbox_id VARCHAR(255) NOT NULL DEFAULT '',
			sync_interval VARCHAR(32) NOT NULL DEFAULT '5m', calendar_mailbox VARCHAR(255) NOT NULL DEFAULT '',
			app_base_url VARCHAR(512) NOT NULL DEFAULT '', user_mode VARCHAR(20) NOT NULL DEFAULT 'local',
			user_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE, user_group_id VARCHAR(128) NOT NULL DEFAULT '',
			user_sync_interval_minutes INT NOT NULL DEFAULT 60, disable_removed_users BOOLEAN NOT NULL DEFAULT TRUE,
			microsoft_login_enabled BOOLEAN NOT NULL DEFAULT FALSE, last_user_sync_at TIMESTAMPTZ,
			last_user_sync_status VARCHAR(32) NOT NULL DEFAULT 'never', last_user_sync_error TEXT NOT NULL DEFAULT '',
			last_user_sync_count INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS app_base_url VARCHAR(512) NOT NULL DEFAULT ''`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS user_mode VARCHAR(20) NOT NULL DEFAULT 'local'`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS user_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS user_group_id VARCHAR(128) NOT NULL DEFAULT ''`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS user_sync_interval_minutes INT NOT NULL DEFAULT 60`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS disable_removed_users BOOLEAN NOT NULL DEFAULT TRUE`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS microsoft_login_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS last_user_sync_at TIMESTAMPTZ`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS last_user_sync_status VARCHAR(32) NOT NULL DEFAULT 'never'`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS last_user_sync_error TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS last_user_sync_count INT NOT NULL DEFAULT 0`,
		`ALTER TABLE m365_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`CREATE TABLE IF NOT EXISTS microsoft_user_profiles (
			user_id INT PRIMARY KEY REFERENCES users(userid) ON DELETE CASCADE,
			microsoft_id VARCHAR(128) NOT NULL UNIQUE, user_principal_name VARCHAR(255) NOT NULL DEFAULT '',
			display_name VARCHAR(255) NOT NULL DEFAULT '', job_title VARCHAR(255) NOT NULL DEFAULT '',
			department VARCHAR(255) NOT NULL DEFAULT '', office_location VARCHAR(255) NOT NULL DEFAULT '',
			mobile_phone VARCHAR(100) NOT NULL DEFAULT '', business_phones JSONB NOT NULL DEFAULT '[]'::jsonb,
			preferred_language VARCHAR(32) NOT NULL DEFAULT '', raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
			last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`INSERT INTO m365_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return fmt.Errorf("ensure Microsoft schema: %w", err)
		}
	}
	return nil
}

func (s *Service) GetSettings(ctx context.Context) (Settings, error) {
	var settings Settings
	err := s.db.WithContext(ctx).First(&settings, 1).Error
	return settings, err
}

func (s *Service) SaveSettings(ctx context.Context, next Settings) (Settings, error) {
	if next.UserMode != "local" && next.UserMode != "microsoft" && next.UserMode != "hybrid" {
		return Settings{}, errors.New("invalid user mode")
	}
	if next.UserSyncIntervalMinutes < 5 {
		next.UserSyncIntervalMinutes = 5
	}
	if next.SyncInterval == "" {
		next.SyncInterval = "5m"
	}
	if next.UserMode == "microsoft" && (!next.MicrosoftLoginEnabled || !next.UserSyncEnabled || next.TenantID == "" || next.ClientID == "" || next.UserGroupID == "") {
		return Settings{}, errors.New("Microsoft-Modus erfordert aktivierte Synchronisation und Anmeldung sowie Tenant-, Client- und Gruppen-ID")
	}
	current, err := s.GetSettings(ctx)
	if err != nil {
		return Settings{}, err
	}
	if next.ClientSecret == "" || next.ClientSecret == maskedSecret {
		next.ClientSecret = current.ClientSecret
	}
	next.ID = 1
	next.LastUserSyncAt = current.LastUserSyncAt
	next.LastUserSyncStatus = current.LastUserSyncStatus
	next.LastUserSyncError = current.LastUserSyncError
	next.LastUserSyncCount = current.LastUserSyncCount
	next.UpdatedAt = time.Now()
	if err := s.db.WithContext(ctx).Save(&next).Error; err != nil {
		return Settings{}, err
	}
	return next.Masked(), nil
}

func (s *Service) acquireToken(ctx context.Context, settings Settings, scope string) (string, error) {
	form := url.Values{
		"client_id":     {settings.ClientID},
		"client_secret": {settings.ClientSecret},
		"grant_type":    {"client_credentials"},
		"scope":         {scope},
	}
	endpoint := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", url.PathEscape(settings.TenantID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var token tokenResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&token); err != nil {
		return "", fmt.Errorf("decode Microsoft token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK || token.AccessToken == "" {
		return "", fmt.Errorf("Microsoft token request failed: %s", firstNonEmpty(token.Description, token.Error, resp.Status))
	}
	return token.AccessToken, nil
}

func (s *Service) listGroupUsers(ctx context.Context, settings Settings) ([]DirectoryUser, error) {
	if settings.TenantID == "" || settings.ClientID == "" || settings.ClientSecret == "" || settings.UserGroupID == "" {
		return nil, errors.New("Tenant-ID, Client-ID, Client-Secret und Gruppen-ID sind erforderlich")
	}
	token, err := s.acquireToken(ctx, settings, "https://graph.microsoft.com/.default")
	if err != nil {
		return nil, err
	}
	selectFields := "id,displayName,givenName,surname,mail,userPrincipalName,accountEnabled,jobTitle,department,officeLocation,businessPhones,mobilePhone,preferredLanguage"
	next := fmt.Sprintf("https://graph.microsoft.com/v1.0/groups/%s/transitiveMembers/microsoft.graph.user?$select=%s&$top=999&$count=true", url.PathEscape(settings.UserGroupID), selectFields)
	users := make([]DirectoryUser, 0)
	for next != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, next, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("ConsistencyLevel", "eventual")
		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, err
		}
		var page graphPage
		decodeErr := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&page)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("Microsoft Graph group request failed: %s", resp.Status)
		}
		if decodeErr != nil {
			return nil, fmt.Errorf("decode Microsoft users: %w", decodeErr)
		}
		users = append(users, page.Value...)
		next = page.NextLink
	}
	return users, nil
}

func (s *Service) TestConnection(ctx context.Context) (int, error) {
	settings, err := s.GetSettings(ctx)
	if err != nil {
		return 0, err
	}
	users, err := s.listGroupUsers(ctx, settings)
	return len(users), err
}

func AuthorizationURL(settings Settings, redirectURI, state string) string {
	query := url.Values{
		"client_id":     {settings.ClientID},
		"response_type": {"code"},
		"redirect_uri":  {redirectURI},
		"response_mode": {"query"},
		"scope":         {"openid profile email User.Read"},
		"state":         {state},
		"prompt":        {"select_account"},
	}
	return fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?%s", url.PathEscape(settings.TenantID), query.Encode())
}

func (s *Service) AuthenticateCode(ctx context.Context, settings Settings, code, redirectURI string) (DirectoryUser, error) {
	form := url.Values{
		"client_id":     {settings.ClientID},
		"client_secret": {settings.ClientSecret},
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"scope":         {"openid profile email User.Read"},
	}
	endpoint := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", url.PathEscape(settings.TenantID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return DirectoryUser{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return DirectoryUser{}, err
	}
	defer resp.Body.Close()
	var token tokenResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&token); err != nil {
		return DirectoryUser{}, err
	}
	if resp.StatusCode != http.StatusOK || token.AccessToken == "" {
		return DirectoryUser{}, fmt.Errorf("Microsoft-Anmeldung fehlgeschlagen: %s", firstNonEmpty(token.Description, token.Error, resp.Status))
	}

	profileURL := "https://graph.microsoft.com/v1.0/me?$select=id,displayName,givenName,surname,mail,userPrincipalName,accountEnabled,jobTitle,department,officeLocation,businessPhones,mobilePhone,preferredLanguage"
	profileReq, err := http.NewRequestWithContext(ctx, http.MethodGet, profileURL, nil)
	if err != nil {
		return DirectoryUser{}, err
	}
	profileReq.Header.Set("Authorization", "Bearer "+token.AccessToken)
	profileResp, err := s.httpClient.Do(profileReq)
	if err != nil {
		return DirectoryUser{}, err
	}
	defer profileResp.Body.Close()
	if profileResp.StatusCode != http.StatusOK {
		return DirectoryUser{}, fmt.Errorf("Microsoft-Profil konnte nicht gelesen werden: %s", profileResp.Status)
	}
	var profile DirectoryUser
	if err := json.NewDecoder(io.LimitReader(profileResp.Body, 1<<20)).Decode(&profile); err != nil {
		return DirectoryUser{}, err
	}
	if profile.ID == "" {
		return DirectoryUser{}, errors.New("Microsoft-Profil enthält keine Benutzer-ID")
	}
	return profile, nil
}

func (s *Service) Sync(ctx context.Context) (SyncResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	settings, err := s.GetSettings(ctx)
	if err != nil {
		return SyncResult{}, err
	}
	if !settings.UserSyncEnabled || settings.UserMode == "local" {
		return SyncResult{}, errors.New("Microsoft-Benutzersynchronisation ist nicht aktiviert")
	}
	users, err := s.listGroupUsers(ctx, settings)
	if err != nil {
		s.recordSync(ctx, "error", err.Error(), 0)
		return SyncResult{}, err
	}

	result := SyncResult{}
	externalIDs := make([]string, 0, len(users))
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, directoryUser := range users {
			if directoryUser.ID == "" {
				result.Skipped++
				continue
			}
			email := strings.TrimSpace(firstNonEmpty(directoryUser.Mail, directoryUser.UserPrincipalName))
			if email == "" {
				result.Skipped++
				result.Warnings = append(result.Warnings, directoryUser.DisplayName+": keine E-Mail/UPN")
				continue
			}
			externalIDs = append(externalIDs, directoryUser.ID)

			var existing struct {
				UserID         uint
				IdentitySource string
			}
			lookup := tx.Table("users").Select("userid AS user_id, identity_source").Where("external_id = ?", directoryUser.ID).Scan(&existing)
			if lookup.Error != nil {
				return lookup.Error
			}
			if existing.UserID == 0 {
				var conflict int64
				tx.Table("users").Where("LOWER(email) = LOWER(?)", email).Count(&conflict)
				if conflict > 0 {
					result.Skipped++
					result.Warnings = append(result.Warnings, email+": bereits als lokaler Benutzer vorhanden")
					continue
				}
				username, usernameErr := availableUsername(tx, directoryUser, email)
				if usernameErr != nil {
					return usernameErr
				}
				active := directoryUser.AccountEnabled == nil || *directoryUser.AccountEnabled
				row := map[string]any{
					"username": username, "email": email, "password_hash": "!microsoft-identity!",
					"first_name": directoryUser.GivenName, "last_name": directoryUser.Surname,
					"is_admin": false, "is_active": active, "force_password_change": false,
					"identity_source": "microsoft", "external_id": directoryUser.ID,
					"created_at": time.Now(), "updated_at": time.Now(),
				}
				if err := tx.Table("users").Create(row).Error; err != nil {
					return err
				}
				if err := tx.Table("users").Select("userid AS user_id").Where("external_id = ?", directoryUser.ID).Scan(&existing).Error; err != nil {
					return err
				}
				result.Imported++
			} else {
				active := directoryUser.AccountEnabled == nil || *directoryUser.AccountEnabled
				updates := map[string]any{
					"email": email, "first_name": directoryUser.GivenName, "last_name": directoryUser.Surname,
					"is_active": active, "updated_at": time.Now(), "identity_source": "microsoft",
				}
				if err := tx.Table("users").Where("userid = ?", existing.UserID).Updates(updates).Error; err != nil {
					return err
				}
				result.Updated++
			}

			displayName := strings.TrimSpace(firstNonEmpty(directoryUser.DisplayName, strings.TrimSpace(directoryUser.GivenName+" "+directoryUser.Surname), email))
			if err := tx.Exec(`INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
				VALUES (?, ?, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()`, existing.UserID, displayName).Error; err != nil {
				return err
			}
			phones, _ := json.Marshal(directoryUser.BusinessPhones)
			raw, _ := json.Marshal(directoryUser)
			if err := tx.Exec(`INSERT INTO microsoft_user_profiles
				(user_id, microsoft_id, user_principal_name, display_name, job_title, department, office_location, mobile_phone, business_phones, preferred_language, raw_profile, last_synced_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, NOW())
				ON CONFLICT (user_id) DO UPDATE SET microsoft_id=EXCLUDED.microsoft_id, user_principal_name=EXCLUDED.user_principal_name,
				display_name=EXCLUDED.display_name, job_title=EXCLUDED.job_title, department=EXCLUDED.department,
				office_location=EXCLUDED.office_location, mobile_phone=EXCLUDED.mobile_phone, business_phones=EXCLUDED.business_phones,
				preferred_language=EXCLUDED.preferred_language, raw_profile=EXCLUDED.raw_profile, last_synced_at=NOW()`,
				existing.UserID, directoryUser.ID, directoryUser.UserPrincipalName, displayName, directoryUser.JobTitle,
				directoryUser.Department, directoryUser.OfficeLocation, directoryUser.MobilePhone, string(phones), directoryUser.PreferredLanguage, string(raw)).Error; err != nil {
				return err
			}
		}

		if settings.DisableRemovedUsers {
			query := tx.Table("users").Where("identity_source = ? AND is_active = ?", "microsoft", true)
			if len(externalIDs) > 0 {
				query = query.Where("external_id NOT IN ?", externalIDs)
			}
			update := query.Update("is_active", false)
			if update.Error != nil {
				return update.Error
			}
			result.Disabled = int(update.RowsAffected)
		}
		return nil
	})
	if err != nil {
		s.recordSync(ctx, "error", err.Error(), 0)
		return SyncResult{}, err
	}
	status := "success"
	message := ""
	if len(result.Warnings) > 0 {
		status = "warning"
		message = strings.Join(result.Warnings, "; ")
	}
	s.recordSync(ctx, status, message, result.Imported+result.Updated)
	return result, nil
}

func (s *Service) recordSync(ctx context.Context, status, syncError string, count int) {
	now := time.Now()
	_ = s.db.WithContext(ctx).Table("m365_settings").Where("id = 1").Updates(map[string]any{
		"last_user_sync_at": now, "last_user_sync_status": status,
		"last_user_sync_error": syncError, "last_user_sync_count": count,
	}).Error
}

func (s *Service) Start(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				settings, err := s.GetSettings(ctx)
				if err != nil || !settings.UserSyncEnabled || settings.UserMode == "local" {
					continue
				}
				interval := time.Duration(settings.UserSyncIntervalMinutes) * time.Minute
				if settings.LastUserSyncAt == nil || time.Since(*settings.LastUserSyncAt) >= interval {
					_, _ = s.Sync(ctx)
				}
			}
		}
	}()
}

func availableUsername(tx *gorm.DB, user DirectoryUser, email string) (string, error) {
	base := strings.TrimSpace(strings.Split(firstNonEmpty(user.UserPrincipalName, email), "@")[0])
	if base == "" {
		base = "microsoft-user"
	}
	for i := 0; i < 1000; i++ {
		candidate := base
		if i > 0 {
			candidate = fmt.Sprintf("%s-%d", base, i+1)
		}
		var count int64
		if err := tx.Table("users").Where("LOWER(username) = LOWER(?)", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
	}
	return "", errors.New("kein freier Benutzername gefunden")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
