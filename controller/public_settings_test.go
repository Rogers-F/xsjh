package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// publicSettingsExpectedKeys 与前端 PublicSettings 类型的 28 个键一一对应
var publicSettingsExpectedKeys = []string{
	"registration_enabled",
	"email_verify_enabled",
	"registration_email_suffix_whitelist",
	"promo_code_enabled",
	"password_reset_enabled",
	"invitation_code_enabled",
	"turnstile_enabled",
	"turnstile_site_key",
	"site_name",
	"site_logo",
	"site_subtitle",
	"api_base_url",
	"contact_info",
	"doc_url",
	"home_content",
	"hide_ccs_import_button",
	"purchase_subscription_enabled",
	"purchase_subscription_url",
	"payg_enabled",
	"payg_exchange_rate",
	"payg_fixed_amount_options",
	"custom_menu_items",
	"custom_endpoints",
	"linuxdo_oauth_enabled",
	"backend_mode_enabled",
	"version",
	"chat_provider_mode",
	"newapi_console_url",
}

// setupPublicSettingsTest 快照并恢复 BuildPublicSettings 触碰的全局状态，
// 再设置一组确定的基线值（不依赖数据库，不调用 InitOptionMap）。
func setupPublicSettingsTest(t *testing.T) {
	t.Helper()
	origOptionMap := common.OptionMap
	origRegister := common.RegisterEnabled
	origPasswordRegister := common.PasswordRegisterEnabled
	origEmailVerification := common.EmailVerificationEnabled
	origDomainRestriction := common.EmailDomainRestrictionEnabled
	origDomainWhitelist := common.EmailDomainWhitelist
	origTurnstileCheck := common.TurnstileCheckEnabled
	origTurnstileSiteKey := common.TurnstileSiteKey
	origTurnstileSecretKey := common.TurnstileSecretKey
	origSystemName := common.SystemName
	origLogo := common.Logo
	origLinuxDO := common.LinuxDOOAuthEnabled
	origServerAddress := system_setting.ServerAddress
	generalSetting := operation_setting.GetGeneralSetting()
	origDocsLink := generalSetting.DocsLink
	t.Cleanup(func() {
		common.OptionMap = origOptionMap
		common.RegisterEnabled = origRegister
		common.PasswordRegisterEnabled = origPasswordRegister
		common.EmailVerificationEnabled = origEmailVerification
		common.EmailDomainRestrictionEnabled = origDomainRestriction
		common.EmailDomainWhitelist = origDomainWhitelist
		common.TurnstileCheckEnabled = origTurnstileCheck
		common.TurnstileSiteKey = origTurnstileSiteKey
		common.TurnstileSecretKey = origTurnstileSecretKey
		common.SystemName = origSystemName
		common.Logo = origLogo
		common.LinuxDOOAuthEnabled = origLinuxDO
		system_setting.ServerAddress = origServerAddress
		generalSetting.DocsLink = origDocsLink
	})
	common.OptionMap = map[string]string{}
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = false
	common.EmailDomainRestrictionEnabled = false
	common.EmailDomainWhitelist = []string{"gmail.com"}
	common.TurnstileCheckEnabled = false
	common.TurnstileSiteKey = ""
	common.TurnstileSecretKey = ""
	common.SystemName = "星算"
	common.Logo = ""
	common.LinuxDOOAuthEnabled = false
	system_setting.ServerAddress = "https://example.com"
	generalSetting.DocsLink = "https://docs.example.com"
}

func performPublicSettingsRequest(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/public-settings", GetPublicSettings)
	req := httptest.NewRequest(http.MethodGet, "/api/public-settings", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestGetPublicSettingsEnvelopeAndExactKeys(t *testing.T) {
	setupPublicSettingsTest(t)
	w := performPublicSettingsRequest(t)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))

	var resp struct {
		Success bool                       `json:"success"`
		Message string                     `json:"message"`
		Data    map[string]json.RawMessage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.True(t, resp.Success)
	require.Equal(t, "", resp.Message)

	actualKeys := make([]string, 0, len(resp.Data))
	for key := range resp.Data {
		actualKeys = append(actualKeys, key)
	}
	require.ElementsMatch(t, publicSettingsExpectedKeys, actualKeys)
}

func TestPublicSettingsEmptyArraysSerializeAsArrays(t *testing.T) {
	setupPublicSettingsTest(t)
	w := performPublicSettingsRequest(t)
	body := w.Body.String()
	require.Contains(t, body, `"registration_email_suffix_whitelist":[]`)
	require.Contains(t, body, `"payg_fixed_amount_options":[]`)
	require.Contains(t, body, `"custom_menu_items":[]`)
	require.Contains(t, body, `"custom_endpoints":[]`)
	require.NotContains(t, body, "null")
}

func TestPublicSettingsRegistrationEnabledTruthTable(t *testing.T) {
	setupPublicSettingsTest(t)
	cases := []struct {
		register         bool
		passwordRegister bool
		expected         bool
	}{
		{true, true, true},
		{true, false, false},
		{false, true, false},
		{false, false, false},
	}
	for _, tc := range cases {
		common.RegisterEnabled = tc.register
		common.PasswordRegisterEnabled = tc.passwordRegister
		settings := BuildPublicSettings()
		require.Equal(t, tc.expected, settings.RegistrationEnabled,
			"RegisterEnabled=%v PasswordRegisterEnabled=%v", tc.register, tc.passwordRegister)
	}
}

func TestPublicSettingsChatProviderMode(t *testing.T) {
	setupPublicSettingsTest(t)
	cases := []struct {
		value    string
		set      bool
		expected string
	}{
		{"sub2api", true, "sub2api"},
		{"newapi_bff", true, "newapi_bff"},
		{"garbage", true, "newapi_bff"},
		{"", true, "newapi_bff"},
		{"", false, "newapi_bff"}, // 未注册选项
	}
	for _, tc := range cases {
		if tc.set {
			common.OptionMap["XingsuanChatProviderMode"] = tc.value
		} else {
			delete(common.OptionMap, "XingsuanChatProviderMode")
		}
		settings := BuildPublicSettings()
		require.Equal(t, tc.expected, settings.ChatProviderMode, "value=%q set=%v", tc.value, tc.set)
	}
}

func TestPublicSettingsEmailSuffixWhitelist(t *testing.T) {
	setupPublicSettingsTest(t)
	common.EmailDomainWhitelist = []string{"qq.com", "", "  "}

	common.EmailDomainRestrictionEnabled = false
	settings := BuildPublicSettings()
	require.Equal(t, []string{}, settings.RegistrationEmailSuffixWhitelist)

	common.EmailDomainRestrictionEnabled = true
	settings = BuildPublicSettings()
	require.Equal(t, []string{"qq.com"}, settings.RegistrationEmailSuffixWhitelist)
}

func TestPublicSettingsForcedFalseFields(t *testing.T) {
	setupPublicSettingsTest(t)
	common.LinuxDOOAuthEnabled = true
	common.OptionMap["LinuxDOOAuthEnabled"] = "true"
	settings := BuildPublicSettings()
	require.False(t, settings.PromoCodeEnabled)
	require.False(t, settings.InvitationCodeEnabled)
	require.False(t, settings.LinuxdoOauthEnabled)
	require.False(t, settings.PasswordResetEnabled)
	require.False(t, settings.PaygEnabled)
	require.Equal(t, float64(0), settings.PaygExchangeRate)
	require.Equal(t, []float64{}, settings.PaygFixedAmountOptions)
}

func TestPublicSettingsCustomMenuItems(t *testing.T) {
	setupPublicSettingsTest(t)

	t.Run("admin visibility filtered out", func(t *testing.T) {
		common.OptionMap["XingsuanCustomMenuItems"] = `[
			{"id":"a","label":"A","icon_svg":"","url":"https://a.example.com","visibility":"user","sort_order":1},
			{"id":"b","label":"B","icon_svg":"","url":"https://b.example.com","visibility":"admin","sort_order":2}
		]`
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomMenuItems, 1)
		require.Equal(t, "a", settings.CustomMenuItems[0].Id)
	})

	t.Run("dangerous url schemes blanked while https kept", func(t *testing.T) {
		common.OptionMap["XingsuanCustomMenuItems"] = `[
			{"id":"js","label":"JS","icon_svg":"","url":"javascript:alert(1)","visibility":"user","sort_order":1},
			{"id":"data","label":"Data","icon_svg":"","url":"data:text/html,x","visibility":"user","sort_order":2},
			{"id":"file","label":"File","icon_svg":"","url":"file:///etc/passwd","visibility":"user","sort_order":3},
			{"id":"ok","label":"OK","icon_svg":"","url":"https://ok.example.com","visibility":"user","sort_order":4}
		]`
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomMenuItems, 4)
		urls := map[string]string{}
		for _, item := range settings.CustomMenuItems {
			urls[item.Id] = item.Url
		}
		require.Equal(t, "", urls["js"])
		require.Equal(t, "", urls["data"])
		require.Equal(t, "", urls["file"])
		require.Equal(t, "https://ok.example.com", urls["ok"])
	})

	t.Run("malformed json falls back to empty", func(t *testing.T) {
		common.OptionMap["XingsuanCustomMenuItems"] = `{not valid json`
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomMenuItems, 0)
		require.NotNil(t, settings.CustomMenuItems)
	})

	t.Run("wrong-typed item falls back to empty", func(t *testing.T) {
		common.OptionMap["XingsuanCustomMenuItems"] = `[{"id":123,"label":"L","url":"https://x.example.com","visibility":"user","sort_order":"nope"}]`
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomMenuItems, 0)
		require.NotNil(t, settings.CustomMenuItems)
	})

	t.Run("more than 50 items truncated", func(t *testing.T) {
		items := make([]string, 0, 60)
		for i := 0; i < 60; i++ {
			items = append(items, fmt.Sprintf(
				`{"id":"m%d","label":"M%d","icon_svg":"","url":"https://m.example.com","visibility":"user","sort_order":%d}`, i, i, i))
		}
		common.OptionMap["XingsuanCustomMenuItems"] = "[" + strings.Join(items, ",") + "]"
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomMenuItems, 50)
	})

	t.Run("oversize raw falls back to empty", func(t *testing.T) {
		common.OptionMap["XingsuanCustomMenuItems"] = "[" + strings.Repeat(" ", 64*1024) + "]"
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomMenuItems, 0)
		require.NotNil(t, settings.CustomMenuItems)
	})
}

func TestPublicSettingsCustomEndpoints(t *testing.T) {
	setupPublicSettingsTest(t)

	t.Run("malformed json falls back to empty", func(t *testing.T) {
		common.OptionMap["XingsuanCustomEndpoints"] = `not json`
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomEndpoints, 0)
		require.NotNil(t, settings.CustomEndpoints)
	})

	t.Run("more than 50 endpoints truncated", func(t *testing.T) {
		endpoints := make([]string, 0, 55)
		for i := 0; i < 55; i++ {
			endpoints = append(endpoints, fmt.Sprintf(`{"name":"e%d","endpoint":"/v%d","description":""}`, i, i))
		}
		common.OptionMap["XingsuanCustomEndpoints"] = "[" + strings.Join(endpoints, ",") + "]"
		settings := BuildPublicSettings()
		require.Len(t, settings.CustomEndpoints, 50)
	})
}

// TestPublicSettingsScalarURLSanitizer 钉死五个标量 URL 字段的 scheme 白名单:
// 危险 scheme 置空、http(s) 放行、无 scheme 的联系信息放行。
func TestPublicSettingsScalarURLSanitizer(t *testing.T) {
	setupPublicSettingsTest(t)

	t.Run("dangerous schemes blanked", func(t *testing.T) {
		system_setting.ServerAddress = "javascript:alert(1)"
		operation_setting.GetGeneralSetting().DocsLink = "data:text/html,x"
		common.OptionMap["XingsuanContactInfo"] = "file:///etc/passwd"
		common.OptionMap["XingsuanConsoleUrl"] = "javascript:void(0)"
		common.OptionMap["XingsuanPurchaseSubscriptionUrl"] = "vbscript:msgbox(1)"
		settings := BuildPublicSettings()
		require.Equal(t, "", settings.ApiBaseUrl)
		require.Equal(t, "", settings.DocUrl)
		require.Equal(t, "", settings.ContactInfo)
		require.Equal(t, "", settings.NewapiConsoleUrl)
		require.Equal(t, "", settings.PurchaseSubscriptionUrl)
	})

	t.Run("http(s) and scheme-less values kept", func(t *testing.T) {
		system_setting.ServerAddress = "https://api.example.com"
		operation_setting.GetGeneralSetting().DocsLink = "http://docs.example.com"
		common.OptionMap["XingsuanContactInfo"] = "admin@example.com"
		common.OptionMap["XingsuanConsoleUrl"] = "https://console.example.com"
		common.OptionMap["XingsuanPurchaseSubscriptionUrl"] = "https://buy.example.com"
		settings := BuildPublicSettings()
		require.Equal(t, "https://api.example.com", settings.ApiBaseUrl)
		require.Equal(t, "http://docs.example.com", settings.DocUrl)
		require.Equal(t, "admin@example.com", settings.ContactInfo)
		require.Equal(t, "https://console.example.com", settings.NewapiConsoleUrl)
		require.Equal(t, "https://buy.example.com", settings.PurchaseSubscriptionUrl)
	})
}

func TestPublicSettingsNoSecretLeak(t *testing.T) {
	setupPublicSettingsTest(t)
	common.OptionMap["SMTPToken"] = "smtp-secret-v"
	common.OptionMap["TurnstileSecretKey"] = "ts-map-secret-v"
	common.OptionMap["StripeApiSecret"] = "sk_live_stripe-secret-v"
	common.TurnstileSecretKey = "ts-secret-v"
	w := performPublicSettingsRequest(t)
	body := w.Body.String()
	require.NotContains(t, body, "smtp-secret-v")
	require.NotContains(t, body, "ts-map-secret-v")
	require.NotContains(t, body, "sk_live_stripe-secret-v")
	require.NotContains(t, body, "ts-secret-v")
}

// TestRenderAppConfigScriptEscapesScriptBreakout pins the XSS guarantee of the
// per-request index injection: option-controlled strings cannot break out of
// the injected <script> element because json.Marshal HTML-escapes <, > and &.
func TestRenderAppConfigScriptEscapesScriptBreakout(t *testing.T) {
	setupPublicSettingsTest(t)
	common.SystemName = "</script><script>alert(1)</script>"

	out := RenderAppConfigScript()
	require.NotNil(t, out)
	s := string(out)
	require.True(t, strings.HasPrefix(s, "<script>window.__APP_CONFIG__="))
	require.True(t, strings.HasSuffix(s, ";</script>"))

	payload := strings.TrimSuffix(strings.TrimPrefix(s, "<script>window.__APP_CONFIG__="), ";</script>")
	// json.Marshal escapes EVERY '<' (to <), so the payload may not contain
	// a single literal one — strictly stronger than checking for "</script".
	require.NotContains(t, payload, "<")

	// The malicious value round-trips intact as data.
	var decoded map[string]any
	require.NoError(t, json.Unmarshal([]byte(payload), &decoded))
	require.Equal(t, "</script><script>alert(1)</script>", decoded["site_name"])
}
