import { Button, Card } from "@agentscope-ai/design";
import { Markdown, WelcomePrompts } from "@agentscope-ai/chat";
import { useState } from "react";

import type { ChatMessage, ModuleKey } from "../types";

interface ConversationPanelProps {
  activeModule: ModuleKey;
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  suggestions: string[];
  isSending: boolean;
}

export function ConversationPanel({
  activeModule,
  messages,
  onSendMessage,
  suggestions,
  isSending,
}: ConversationPanelProps) {
  const [draft, setDraft] = useState("");

  const submit = async () => {
    const value = draft.trim();
    if (!value) {
      return;
    }
    setDraft("");
    await onSendMessage(value);
  };

  return (
    <Card
      className="conversation-card"
      title="Founder command deck"
      extra={<span className="small-kicker">{activeModule}</span>}
    >
      <div className="conversation-thread">
        {messages.length === 0 ? (
          <WelcomePrompts
            greeting="Start with the real founder bottleneck"
            description="The workspace will route the request to the right agent team and preserve the outputs as artifacts, runs, and approvals."
            prompts={suggestions}
            onClick={(query) => void onSendMessage(query)}
          />
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`message-bubble ${message.role === "assistant" ? "assistant" : "user"}`}
            >
              <div className="message-meta">
                <strong>{message.author}</strong>
                <span>{new Date(message.created_at).toLocaleTimeString()}</span>
              </div>
              {message.role === "assistant" ? (
                <Markdown content={message.content} />
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          ))
        )}
      </div>

      <div className="prompt-rail">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="prompt-chip"
            onClick={() => void onSendMessage(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="composer">
        <textarea
          aria-label="Founder prompt"
          className="composer-input"
          placeholder="Ask for an operating plan, founder review, investor memo, workflow, or delegation..."
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="primary" onClick={() => void submit()} loading={isSending}>
          Send to founder OS
        </Button>
      </div>
    </Card>
  );
}
