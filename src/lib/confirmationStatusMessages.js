import { getBookingPlatform, getIclosedEventCallId } from './iclosedBooking';

function normalizeErrorText(errorMessage) {
  if (!errorMessage) return '';
  const raw = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
  return raw.replace(/^iClosed API error:\s*\d+\s*/i, '').trim();
}

/**
 * User-facing explanation when Calendly / iClosed cancel API fails.
 */
export function formatExternalCancelError(platformLabel, errorMessage, lead) {
  const platform = getBookingPlatform(lead?.reschedule_link) || platformLabel?.toLowerCase();
  const text = normalizeErrorText(errorMessage);
  const lower = text.toLowerCase();

  if (platform === 'iclosed') {
    if (/event call not found|not found/i.test(lower)) {
      const eventCallId = getIclosedEventCallId(lead?.calendly_id);
      return eventCallId
        ? `iClosed could not find booking #${eventCallId}. It may have been rescheduled, removed, or the ID in our system is outdated. Cancel it manually in iClosed if the call is still on the calendar.`
        : 'iClosed could not find this booking. Our system has no valid iClosed event ID for this call — cancel it manually in iClosed if needed.';
    }
    if (/already cancel/i.test(lower)) {
      return 'This call is already cancelled in iClosed.';
    }
    if (/iclosed_api_key|not configured/i.test(lower)) {
      return 'iClosed is not configured on the server, so the booking could not be cancelled automatically.';
    }
    return text
      ? `iClosed cancellation failed: ${text}`
      : 'iClosed cancellation failed for an unknown reason.';
  }

  if (platform === 'calendly' || platformLabel === 'Calendly') {
    if (/already cancel/i.test(lower)) {
      return 'This Calendly event is already cancelled.';
    }
    if (/invalid event uri|invalid/i.test(lower)) {
      return 'Calendly could not cancel this event because the stored booking link is invalid. Cancel it manually in Calendly.';
    }
    return text
      ? `Calendly cancellation failed: ${text}`
      : 'Calendly cancellation failed for an unknown reason.';
  }

  return text || 'The external booking could not be cancelled automatically.';
}

export function formatExternalCancelSkippedMessage(lead) {
  const platform = getBookingPlatform(lead?.reschedule_link);
  if (platform === 'iclosed') {
    if (!getIclosedEventCallId(lead?.calendly_id)) {
      return 'No iClosed booking ID is stored for this call, so iClosed was not updated. Confirmed will still be set to NO in the CRM.';
    }
  }
  if (platform === 'calendly') {
    return 'No Calendly event link is stored for this call, so Calendly was not updated. Confirmed will still be set to NO in the CRM.';
  }
  return null;
}

/**
 * Summary after setter confirms cancellation (Confirmed → NO).
 */
export function buildConfirmedNoResultMessage({ cancelResult, lead, crmUpdated }) {
  const lines = [];

  if (cancelResult?.skipped) {
    const skipped = formatExternalCancelSkippedMessage(lead);
    if (skipped) lines.push(skipped);
  } else if (cancelResult?.ok) {
    if (cancelResult.alreadyCanceled) {
      lines.push(`${cancelResult.platformLabel}: call was already cancelled.`);
    } else {
      lines.push(`${cancelResult.platformLabel}: booking cancelled successfully.`);
    }
  } else if (cancelResult) {
    lines.push(formatExternalCancelError(cancelResult.platformLabel, cancelResult.errorMessage, lead));
  }

  if (crmUpdated) {
    lines.push('Confirmed is now NO in the CRM.');
  } else {
    lines.push('Confirmed was not saved in the CRM — please try again.');
  }

  return lines.join('\n\n');
}

/**
 * User-facing message when Confirmed → YES fails (usually ManyChat / closer bot).
 */
export function formatConfirmedYesError(error) {
  const message = error?.message || String(error || '');
  const lower = message.toLowerCase();

  if (/subscriber not found|find subscriber|phone/i.test(lower)) {
    return 'Could not find this lead in the closer\'s ManyChat bot. The lead is marked Confirmed in the CRM, but the closer was not notified. Check that the lead\'s phone matches ManyChat or ask support to link the subscriber.';
  }
  if (/api key|unauthorized|401|403/i.test(lower)) {
    return 'ManyChat rejected the request (API key or permissions). The lead is marked Confirmed in the CRM, but the closer bot was not updated.';
  }
  if (/already exists/i.test(lower)) {
    return 'ManyChat says this contact already exists, but the CRM could not link them to the closer bot. The lead is marked Confirmed — support may need to link the subscriber manually.';
  }
  if (message) {
    return `Confirmed was saved in the CRM, but sending to the closer failed: ${message}`;
  }
  return 'Confirmed was saved in the CRM, but sending to the closer\'s ManyChat failed.';
}

export function formatSupabaseConfirmedError(error) {
  const message = error?.message || String(error || '');
  if (/permission|rls|policy/i.test(message)) {
    return 'You do not have permission to update Confirmed for this call.';
  }
  if (message) return `Could not save Confirmed: ${message}`;
  return 'Could not save Confirmed in the CRM.';
}