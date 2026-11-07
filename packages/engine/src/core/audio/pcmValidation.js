/**
 * Validate one complete PCM channel before its owner mutates sample history.
 * A direct scan avoids an array-method callback for every captured/prepared
 * sample. Callers still own layout, aliasing and stream-admission checks.
 * @param {unknown} channel
 * @param {number} length
 * @returns {channel is Float32Array | Float64Array}
 */
export function isFinitePcmChannel(channel, length) {
  if (
    !(channel instanceof Float32Array || channel instanceof Float64Array) ||
    channel.length !== length
  )
    return false;
  for (let i = 0; i < length; i++)
    if (!Number.isFinite(channel[i])) return false;
  return true;
}
