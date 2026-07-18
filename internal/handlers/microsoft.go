package handlers

import (
	"encoding/json"
	"net/http"

	"coresdashboard/internal/microsoft"
)

type MicrosoftHandler struct {
	service *microsoft.Service
}

func NewMicrosoftHandler(service *microsoft.Service) *MicrosoftHandler {
	return &MicrosoftHandler{service: service}
}

func (h *MicrosoftHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.service.GetSettings(r.Context())
	if err != nil {
		jsonError(w, "Microsoft-Konfiguration konnte nicht geladen werden", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, settings.Masked())
}

func (h *MicrosoftHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var settings microsoft.Settings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		jsonError(w, "Ungültige Anfrage", http.StatusBadRequest)
		return
	}
	saved, err := h.service.SaveSettings(r.Context(), settings)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (h *MicrosoftHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	count, err := h.service.TestConnection(r.Context())
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "usersFound": count})
}

func (h *MicrosoftHandler) SyncUsers(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.Sync(r.Context())
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
