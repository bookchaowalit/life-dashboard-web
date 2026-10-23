// PostHog adapter for browser-analytics.ts. Loaded with a dynamic import only
// after the flag, a key and consent are all present, so the SDK is not part of
// the page until then. Options switch off everything that could collect more
// than the allow-listed events: autocapture (incl. forms), recordings, heatmaps,
// surveys, flags and remote scripts. posthog-js is pinned in package.json.
import type { CaptureResult, PostHogConfig, Properties } from 'posthog-js'
import { PRODUCT, sanitizePath, type AnalyticsAdapter, type AnalyticsConfig } from './browser-analytics';

// Same-site URLs keep origin + cleaned path; referrers keep their origin only.
const PAGE_URL_PROPS = ['$current_url', '$initial_current_url', '$session_entry_url']
const PATH_PROPS = ['$pathname', '$initial_pathname', '$session_entry_pathname', '$prev_pageview_pathname']
const REFERRER_PROPS = ['$referrer', '$initial_referrer', '$session_entry_referrer']

function origin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function scrubProps(props: Properties | undefined): Properties | undefined {
  if (!props) return props
  const clean: Properties = { ...props }
  for (const key of PAGE_URL_PROPS) {
    if (typeof clean[key] === 'string') {
      const base = origin(clean[key])
      clean[key] = base ? base + sanitizePath(clean[key]) : sanitizePath(clean[key])
    }
  }
  for (const key of PATH_PROPS) {
    if (typeof clean[key] === 'string') clean[key] = sanitizePath(clean[key])
  }
  for (const key of REFERRER_PROPS) {
    if (typeof clean[key] === 'string') {
      const base = origin(clean[key])
      if (base) clean[key] = base
      else delete clean[key]
    }
  }
  delete clean.$ip
  return clean
}

export function scrubCapture(result: CaptureResult | null): CaptureResult | null {
  if (!result) return null
  return {
    ...result,
    properties: { ...scrubProps(result.properties), $geoip_disable: true },
    ...(result.$set ? { $set: scrubProps(result.$set) } : {}),
    ...(result.$set_once ? { $set_once: scrubProps(result.$set_once) } : {}),
  }
}

export function posthogOptions(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    rageclick: false,
    disable_session_recording: true,
    session_recording: { maskAllInputs: true },
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    // Turn flags on only when the first pre-registered experiment needs them.
    advanced_disable_flags: true,
    // UTM values come from the query string, which is never kept.
    save_campaign_params: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    // Consent was given before init; still no cookies, local storage only.
    persistence: 'localStorage',
    person_profiles: 'identified_only',
    before_send: scrubCapture,
  }
}

type PostHogModule = { default: Pick<import('posthog-js').PostHog, 'init' | 'register' | 'capture' | 'identify' | 'opt_out_capturing' | 'reset'> }

export async function loadPostHog(
  config: AnalyticsConfig,
  importer: () => Promise<PostHogModule> = () => import('posthog-js'),
): Promise<AnalyticsAdapter> {
  const { default: posthog } = await importer()
  posthog.init(config.key, posthogOptions(config.host))
  posthog.register({ product: PRODUCT })
  return {
    track: (event, props) => {
      posthog.capture(event, props)
    },
    identify: (id) => {
      posthog.identify(id)
    },
    page: (path) => {
      const base = typeof window === 'undefined' ? '' : window.location.origin
      posthog.capture('$pageview', { $current_url: base + path, $pathname: path })
    },
    optOut: () => {
      posthog.opt_out_capturing()
      posthog.reset()
    },
    reset: () => {
      posthog.reset()
    },
  }
}
