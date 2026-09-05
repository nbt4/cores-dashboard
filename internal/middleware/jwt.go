package middleware

import (
	"net/http"

	"coresdashboard/internal/config"

	commonjwt "github.com/nbt4/cores-common/pkg/jwt"
)

type contextKey string

const UserClaimsKey = commonjwt.ClaimsKey

func RequireAuth(cfg *config.Config, lookup commonjwt.UserLookup, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("cores_token")
		if err != nil || cookie.Value == "" {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		claims, ok := commonjwt.ValidateSession(r.Context(), cookie.Value, []byte(cfg.JWTSecret), lookup)
		if !ok {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		r = commonjwt.SetClaims(r, claims)
		next.ServeHTTP(w, r)
	})
}

// RequireAdmin wraps RequireAuth and additionally verifies the IsAdmin claim.
// FIXED: Admin auth bypass — added role check middleware for /api/v1/admin/* and /api/v1/proxy/* routes.
func RequireAdmin(cfg *config.Config, lookup commonjwt.UserLookup, next http.Handler) http.Handler {
	return RequireAuth(cfg, lookup, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := commonjwt.GetClaims(r)
		if !ok || !claims.IsAdmin {
			http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func GetClaims(r *http.Request) (*commonjwt.Claims, bool) {
	return commonjwt.GetClaims(r)
}
