package sintclient

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type GatewayError struct {
	StatusCode int
	Body       string
}

func (e *GatewayError) Error() string {
	return fmt.Sprintf("sint gateway error (%d): %s", e.StatusCode, e.Body)
}

type Client struct {
	BaseURL    string
	APIKey     string
	HTTP       *http.Client
	MaxRetries int
	RetryDelay time.Duration
}

func New(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		APIKey:     apiKey,
		HTTP:       &http.Client{},
		MaxRetries: 2,
		RetryDelay: 150 * time.Millisecond,
	}
}

func (c *Client) WithAPIKey(apiKey string) *Client {
	c.APIKey = apiKey
	return c
}

func (c *Client) WithRetry(maxRetries int, retryDelay time.Duration) *Client {
	if maxRetries >= 0 {
		c.MaxRetries = maxRetries
	}
	if retryDelay > 0 {
		c.RetryDelay = retryDelay
	}
	return c
}

func (c *Client) do(method, path string, payload any, out any) error {
	var body io.Reader
	var bodyBytes []byte
	if payload != nil {
		buf, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		bodyBytes = buf
		body = bytes.NewBuffer(bodyBytes)
	}

	attempts := c.MaxRetries + 1
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if payload != nil {
			body = bytes.NewBuffer(bodyBytes)
		}
		req, err := http.NewRequest(method, c.BaseURL+path, body)
		if err != nil {
			return err
		}
		req.Header.Set("content-type", "application/json")
		if c.APIKey != "" {
			req.Header.Set("x-api-key", c.APIKey)
		}

		res, err := c.HTTP.Do(req)
		if err != nil {
			lastErr = err
			if attempt < attempts {
				time.Sleep(c.RetryDelay * time.Duration(attempt))
				continue
			}
			return err
		}

		if res.StatusCode >= 400 {
			b, _ := io.ReadAll(res.Body)
			_ = res.Body.Close()
			errResp := &GatewayError{StatusCode: res.StatusCode, Body: string(b)}
			lastErr = errResp
			if (res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500) && attempt < attempts {
				time.Sleep(c.RetryDelay * time.Duration(attempt))
				continue
			}
			return errResp
		}

		if out == nil {
			_, _ = io.Copy(io.Discard, res.Body)
			_ = res.Body.Close()
			return nil
		}

		err = json.NewDecoder(res.Body).Decode(out)
		_ = res.Body.Close()
		return err
	}
	if lastErr != nil {
		return lastErr
	}
	return errors.New("request failed without explicit error")
}

func (c *Client) Discovery(out any) error {
	return c.do(http.MethodGet, "/.well-known/sint.json", nil, out)
}

func (c *Client) Health(out any) error {
	return c.do(http.MethodGet, "/v1/health", nil, out)
}

func (c *Client) OpenAPI(out any) error {
	return c.do(http.MethodGet, "/v1/openapi.json", nil, out)
}

func (c *Client) IssueToken(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/tokens", req, out)
}

func (c *Client) RevokeToken(tokenID, reason, by string, out any) error {
	payload := map[string]any{"tokenId": tokenID, "reason": reason, "by": by}
	return c.do(http.MethodPost, "/v1/tokens/revoke", payload, out)
}

func (c *Client) Intercept(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/intercept", req, out)
}

func (c *Client) InterceptBatch(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/intercept/batch", req, out)
}

func (c *Client) ApprovalsPending(out any) error {
	return c.do(http.MethodGet, "/v1/approvals/pending", nil, out)
}

func (c *Client) Approval(requestID string, out any) error {
	return c.do(http.MethodGet, "/v1/approvals/"+requestID, nil, out)
}

func (c *Client) ResolveApproval(requestID, status, by, reason string, out any) error {
	payload := map[string]any{"status": status, "by": by}
	if reason != "" {
		payload["reason"] = reason
	}
	return c.do(http.MethodPost, "/v1/approvals/"+requestID+"/resolve", payload, out)
}

func (c *Client) Ledger(limit int, out any) error {
	return c.do(http.MethodGet, fmt.Sprintf("/v1/ledger?limit=%d", limit), nil, out)
}

func (c *Client) LedgerProof(eventID string, out any) error {
	return c.do(http.MethodGet, "/v1/ledger/"+eventID+"/proof", nil, out)
}

func (c *Client) ComplianceCrosswalk(out any) error {
	return c.do(http.MethodGet, "/v1/compliance/tier-crosswalk", nil, out)
}

func (c *Client) EconomyRoute(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/economy/route", req, out)
}
