/**
 * iClosed event call list parsing and status lookup.
 */

export function parseEventCallsListResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    return [data.data];
  }
  return [];
}

export function isEventCallCanceled(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.canceled === true || record.cancelled === true) return true;
  const status = String(record.status || record.callStatus || '').trim().toLowerCase();
  return status === 'canceled' || status === 'cancelled';
}

function pickEventCallRecord(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[0];
}

function buildStatusPayload(eventCallId, record) {
  if (!record) {
    return {
      eventCallId: String(eventCallId),
      found: false,
      canceled: false,
    };
  }

  return {
    eventCallId: String(eventCallId),
    found: true,
    canceled: isEventCallCanceled(record),
    cancelReason: record.cancelReason || record.cancel_reason || null,
    canceledAt: record.canceledAt || record.canceled_at || record.cancelledAt || null,
    dateTime: record.dateTime || record.date_time || null,
  };
}

/**
 * @param {(path: string) => Promise<{ status: number, data: unknown }>} fetchIclosed
 * @param {string} eventCallId
 */
export async function fetchEventCallStatus(fetchIclosed, eventCallId) {
  const id = String(eventCallId).trim();

  const activeResult = await fetchIclosed(
    `/v1/eventCalls?ids=${encodeURIComponent(id)}`,
  );
  if (activeResult.status >= 400) {
    return {
      eventCallId: id,
      found: false,
      canceled: false,
      error: activeResult.data?.error || 'Failed to check iClosed call status',
    };
  }

  const activeList = parseEventCallsListResponse(activeResult.data);
  const activeRecord = pickEventCallRecord(activeList);
  if (activeRecord) {
    return buildStatusPayload(id, activeRecord);
  }

  const cancelledResult = await fetchIclosed(
    `/v1/eventCalls?ids=${encodeURIComponent(id)}&types=cancelled_events`,
  );
  if (cancelledResult.status >= 400) {
    return {
      eventCallId: id,
      found: false,
      canceled: false,
      error: cancelledResult.data?.error || 'Failed to check iClosed call status',
    };
  }

  const cancelledList = parseEventCallsListResponse(cancelledResult.data);
  const cancelledRecord = pickEventCallRecord(cancelledList);
  return buildStatusPayload(id, cancelledRecord);
}
