package microsoft

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }

func jsonResponse(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestSettingsLoginModes(t *testing.T) {
	tests := []struct {
		mode             string
		microsoftEnabled bool
		wantLocal        bool
		wantMicrosoft    bool
	}{
		{mode: "local", microsoftEnabled: true, wantLocal: true},
		{mode: "microsoft", microsoftEnabled: true, wantMicrosoft: true},
		{mode: "hybrid", microsoftEnabled: true, wantLocal: true, wantMicrosoft: true},
		{mode: "hybrid", microsoftEnabled: false, wantLocal: true},
	}
	for _, test := range tests {
		settings := Settings{UserMode: test.mode, MicrosoftLoginEnabled: test.microsoftEnabled}
		if got := settings.UsesLocalLogin(); got != test.wantLocal {
			t.Errorf("mode %s: UsesLocalLogin() = %v, want %v", test.mode, got, test.wantLocal)
		}
		if got := settings.UsesMicrosoftLogin(); got != test.wantMicrosoft {
			t.Errorf("mode %s: UsesMicrosoftLogin() = %v, want %v", test.mode, got, test.wantMicrosoft)
		}
	}
}

func TestListGroupUsersFollowsPagination(t *testing.T) {
	graphCalls := 0
	service := &Service{httpClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if strings.Contains(request.URL.Host, "login.microsoftonline.com") {
			return jsonResponse(`{"access_token":"token"}`), nil
		}
		graphCalls++
		if request.Header.Get("Authorization") != "Bearer token" {
			t.Fatalf("missing Graph bearer token")
		}
		if graphCalls == 1 {
			return jsonResponse(`{"value":[{"id":"one","displayName":"One"}],"@odata.nextLink":"https://graph.microsoft.com/next"}`), nil
		}
		return jsonResponse(`{"value":[{"id":"two","displayName":"Two"}]}`), nil
	})}}

	users, err := service.listGroupUsers(context.Background(), Settings{
		TenantID: "tenant", ClientID: "client", ClientSecret: "secret", UserGroupID: "group",
	})
	if err != nil {
		t.Fatalf("listGroupUsers() error = %v", err)
	}
	if len(users) != 2 || users[0].ID != "one" || users[1].ID != "two" {
		t.Fatalf("listGroupUsers() = %#v", users)
	}
}

func TestAuthorizationURLContainsRequiredOAuthValues(t *testing.T) {
	value := AuthorizationURL(Settings{TenantID: "tenant", ClientID: "client"}, "https://cores.example/api/v1/auth/microsoft/callback", "state")
	for _, expected := range []string{"tenant/oauth2/v2.0/authorize", "client_id=client", "response_type=code", "User.Read", "state=state"} {
		if !strings.Contains(value, expected) {
			t.Errorf("AuthorizationURL() missing %q: %s", expected, value)
		}
	}
}
