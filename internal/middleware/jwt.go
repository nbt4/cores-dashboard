package middleware

import (
	"fmt"
	"net/http"

	"coresdashboard/internal/config"

	commonjwt "github.com/nbt4/cores-common/pkg/jwt"
	golangjwt "github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserClaimsKey = commonjwt.ClaimsKey

func RequireAuth(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("cores_token")
		if err != nil || cookie.Value == "" {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		claims := &commonjwt.Claims{}
		token, err := golangjwt.ParseWithClaims(cookie.Value, claims, func(t *golangjwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*golangjwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		r = commonjwt.SetClaims(r, claims)
		next.ServeHTTP(w, r)
	})
}

// RequireAdmin wraps RequireAuth and additionally verifies the IsAdmin claim.
// FIXED: Admin auth bypass — added role check middleware for /api/v1/admin/* and /api/v1/proxy/* routes.
func RequireAdmin(cfg *config.Config, next http.Handler) http.Handler {
	return RequireAuth(cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
