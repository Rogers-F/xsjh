package controller

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

// 自定义菜单/接入点的原始 JSON 上限与条数上限
const (
	customOptionMaxRawBytes = 64 * 1024
	customOptionMaxItems    = 50
)

// RenderAppConfigScript serializes the CURRENT public settings as the
// window.__APP_CONFIG__ bootstrap <script> for the embedded root SPA index.
// Called per index render (NoRoute) so admin option changes reach new page
// loads without a restart — the frontend short-circuits its settings fetch
// when the injected config is present, so a stale startup-time injection
// would persist for the whole session.
//
// XSS note: encoding/json's default Marshal HTML-escapes '<', '>' and '&'
// (to < etc.), so option-controlled strings cannot contain a literal
// "</script>" and break out of the script element. There is currently no CSP
// header anywhere in the stack; if CSP is introduced later, this inline
// script must move to a nonce'd form. Guarded by a test asserting the
// serialized payload never contains a literal "</".
func RenderAppConfigScript() []byte {
	data, err := json.Marshal(BuildPublicSettings())
	if err != nil {
		// Fail open with no injection: the SPA falls back to fetching
		// /api/public-settings at runtime.
		return nil
	}
	return fmt.Appendf(nil, "<script>window.__APP_CONFIG__=%s;</script>", data)
}

// optionString 从选项 map 读取字符串选项，缺失时返回默认值。
// 直接传入 common.OptionMap 时调用方必须持有 OptionMapRWMutex。
func optionString(options map[string]string, key string, def string) string {
	if v, ok := options[key]; ok {
		return v
	}
	return def
}

// optionBool 从选项 map 读取布尔选项，缺失时返回默认值。
func optionBool(options map[string]string, key string, def bool) bool {
	if v, ok := options[key]; ok {
		return v == "true"
	}
	return def
}

// sanitizeExternalURL 校验外链：仅放行 http / https / 无 scheme（邮箱、微信号等联系信息），
// 其余（javascript:、data:、file: 等）一律置空。
func sanitizeExternalURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https", "":
		return raw
	default:
		return ""
	}
}

// parseBoundedJSONArray 解析带原始大小与条数上限的 JSON 数组选项；
// 超限或解析失败一律回落为空数组并记录日志，返回值恒非 nil。
func parseBoundedJSONArray[T any](optionKey, raw string) []T {
	empty := make([]T, 0)
	if len(raw) > customOptionMaxRawBytes {
		common.SysLog(fmt.Sprintf("%s exceeds %d bytes, ignored", optionKey, customOptionMaxRawBytes))
		return empty
	}
	var items []T
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		common.SysLog("failed to parse " + optionKey + ": " + err.Error())
		return empty
	}
	if len(items) > customOptionMaxItems {
		common.SysLog(fmt.Sprintf("%s has %d items, truncated to %d", optionKey, len(items), customOptionMaxItems))
		items = items[:customOptionMaxItems]
	}
	if items == nil {
		return empty
	}
	return items
}

// parseCustomMenuItems 解析自定义菜单项：只保留 visibility=="user" 的项
// （admin 项不得进入公开 DTO——前端 CustomPageView 按 id 加载时不会再做
// 可见性校验），并清洗 URL。
func parseCustomMenuItems(raw string) []dto.CustomMenuItem {
	items := parseBoundedJSONArray[dto.CustomMenuItem]("XingsuanCustomMenuItems", raw)
	result := make([]dto.CustomMenuItem, 0, len(items))
	for _, item := range items {
		if item.Visibility != "user" {
			continue
		}
		item.Url = sanitizeExternalURL(item.Url)
		result = append(result, item)
	}
	return result
}

// BuildPublicSettings 组装星算前端公开配置。
// 仅在持锁期间拷贝原始值，所有 JSON 解析与清洗均在解锁后进行。
func BuildPublicSettings() dto.PublicSettings {
	common.OptionMapRWMutex.RLock()
	registerEnabled := common.RegisterEnabled
	passwordRegisterEnabled := common.PasswordRegisterEnabled
	emailVerificationEnabled := common.EmailVerificationEnabled
	emailDomainRestrictionEnabled := common.EmailDomainRestrictionEnabled
	emailDomainWhitelist := append([]string(nil), common.EmailDomainWhitelist...)
	turnstileCheckEnabled := common.TurnstileCheckEnabled
	turnstileSiteKey := common.TurnstileSiteKey
	systemName := common.SystemName
	logo := common.Logo
	version := common.Version
	serverAddress := system_setting.ServerAddress
	docsLink := operation_setting.GetGeneralSetting().DocsLink
	homeContent := common.OptionMap["HomePageContent"]
	siteSubtitle := optionString(common.OptionMap, "XingsuanSiteSubtitle", common.XingsuanDefaultSiteSubtitle)
	contactInfo := optionString(common.OptionMap, "XingsuanContactInfo", "")
	consoleUrl := optionString(common.OptionMap, "XingsuanConsoleUrl", "")
	chatProviderMode := optionString(common.OptionMap, "XingsuanChatProviderMode", common.XingsuanDefaultChatProviderMode)
	backendModeEnabled := optionBool(common.OptionMap, "XingsuanBackendModeEnabled", false)
	purchaseSubscriptionEnabled := optionBool(common.OptionMap, "XingsuanPurchaseSubscriptionEnabled", false)
	purchaseSubscriptionUrl := optionString(common.OptionMap, "XingsuanPurchaseSubscriptionUrl", "")
	hideCcsImportButton := optionBool(common.OptionMap, "XingsuanHideCcsImportButton", false)
	rawCustomMenuItems := optionString(common.OptionMap, "XingsuanCustomMenuItems", "[]")
	rawCustomEndpoints := optionString(common.OptionMap, "XingsuanCustomEndpoints", "[]")
	common.OptionMapRWMutex.RUnlock()

	whitelist := make([]string, 0)
	if emailDomainRestrictionEnabled {
		for _, domain := range emailDomainWhitelist {
			if strings.TrimSpace(domain) == "" {
				continue
			}
			whitelist = append(whitelist, domain)
		}
	}

	// 融合部署下聊天必须走 /pg 会话路径，非法取值一律回落 newapi_bff
	if chatProviderMode != "sub2api" && chatProviderMode != "newapi_bff" {
		chatProviderMode = common.XingsuanDefaultChatProviderMode
	}

	return dto.PublicSettings{
		// 注册需同时开启 RegisterEnabled 与 PasswordRegisterEnabled（与 controller/user.go Register 的双重门一致）
		RegistrationEnabled:              registerEnabled && passwordRegisterEnabled,
		EmailVerifyEnabled:               emailVerificationEnabled,
		RegistrationEmailSuffixWhitelist: whitelist,
		// 前端兑换码校验是空壳 stub，开启会让注册流程走入死胡同——接通后端校验前保持 false
		PromoCodeEnabled: false,
		// POST /user/reset 直接在 data 返回新密码，且邮件链接 /user/reset 在 Vue 路由中不存在——修复前开启会锁死账号
		PasswordResetEnabled: false,
		// 前端邀请码校验是空壳 stub，开启会让注册流程走入死胡同——接通后端校验前保持 false
		InvitationCodeEnabled: false,
		TurnstileEnabled:      turnstileCheckEnabled,
		TurnstileSiteKey:      turnstileSiteKey,
		SiteName:              systemName,
		SiteLogo:              logo,
		SiteSubtitle:          siteSubtitle,
		ApiBaseUrl:            sanitizeExternalURL(serverAddress),
		ContactInfo:           sanitizeExternalURL(contactInfo),
		DocUrl:                sanitizeExternalURL(docsLink),
		// 根级 HTML 直出属设计内行为，信任模型与 GetHomePageContent（misc.go）一致
		HomeContent:                 homeContent,
		HideCcsImportButton:         hideCcsImportButton,
		PurchaseSubscriptionEnabled: purchaseSubscriptionEnabled,
		PurchaseSubscriptionUrl:     sanitizeExternalURL(purchaseSubscriptionUrl),
		// 本后端没有钱包式按量计费，相关字段固定为零值
		PaygEnabled:            false,
		PaygExchangeRate:       0,
		PaygFixedAmountOptions: make([]float64, 0),
		CustomMenuItems:        parseCustomMenuItems(rawCustomMenuItems),
		CustomEndpoints:        parseBoundedJSONArray[dto.CustomEndpoint]("XingsuanCustomEndpoints", rawCustomEndpoints),
		// Vue 端 OAuth 流程尚未接入 /api/oauth/:provider，接通前保持 false
		LinuxdoOauthEnabled: false,
		BackendModeEnabled:  backendModeEnabled,
		Version:             version,
		ChatProviderMode:    chatProviderMode,
		NewapiConsoleUrl:    sanitizeExternalURL(consoleUrl),
	}
}

// GetPublicSettings 返回星算前端公开配置，响应包络与 GetStatus 保持一致。
func GetPublicSettings(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	common.ApiSuccess(c, BuildPublicSettings())
}
