export class GroupMemory {
  constructor(maxMessages = 6) {
    this.maxMessages = maxMessages;
    this.groups = new Map();
  }

  add(groupId, text) {
    const entries = this.groups.get(groupId) ?? [];
    entries.push({
      text: String(text).replace(/\s+/g, " ").slice(0, 500),
      at: new Date().toISOString()
    });

    if (entries.length > this.maxMessages) {
      entries.splice(0, entries.length - this.maxMessages);
    }

    this.groups.set(groupId, entries);
  }

  getContext(groupId) {
    return (this.groups.get(groupId) ?? [])
      .map((entry, index) => (index + 1) + ". " + entry.text)
      .join("\n");
  }
}

export class GroupLimits {
  constructor() {
    this.groups = new Map();
  }

  get(groupId, now = Date.now()) {
    let stats = this.groups.get(groupId);
    if (!stats || now - stats.windowStart >= 60 * 60 * 1000) {
      stats = {
        windowStart: now,
        aiCalls: 0,
        replies: 0,
        lastReplyAt: 0,
        lastAttemptAt: 0
      };
      this.groups.set(groupId, stats);
    }
    return stats;
  }

  canCallAI(groupId, maxCalls, now = Date.now()) {
    return this.get(groupId, now).aiCalls < maxCalls;
  }

  markAICall(groupId, now = Date.now()) {
    this.get(groupId, now).aiCalls += 1;
  }

  canReply(groupId, cooldownMs, maxReplies, now = Date.now()) {
    const stats = this.get(groupId, now);
    return stats.replies < maxReplies && now - stats.lastReplyAt >= cooldownMs;
  }

  markReply(groupId, now = Date.now()) {
    const stats = this.get(groupId, now);
    stats.replies += 1;
    stats.lastReplyAt = now;
    stats.lastAttemptAt = now;
  }

  markAttempt(groupId, now = Date.now()) {
    this.get(groupId, now).lastAttemptAt = now;
  }

  isCoolingDown(groupId, cooldownMs, now = Date.now()) {
    const stats = this.get(groupId, now);
    return now - stats.lastAttemptAt < cooldownMs;
  }
}
