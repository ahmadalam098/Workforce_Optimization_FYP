import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import Spinner from '../ui/Spinner.jsx'
import { formatDay, formatTime } from '../../utils/format.js'
import PageHeader from '../../portals/admin/shared/PageHeader.jsx'
import { EmptyState, ErrorState } from '../../portals/admin/shared/StateBox.jsx'
import '../../portals/manager/chat/ManagerChatPage.css'

const MAX_LENGTH = 2000

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function preview(message, mine) {
  if (!message) return 'No messages yet'
  const text = message.body.length > 60 ? `${message.body.slice(0, 60)}...` : message.body
  return message.senderType === mine ? `You: ${text}` : text
}

/** One tick when sent, two when the organization has read it. */
function Ticks({ read }) {
  return (
    <span className={`chat-ticks ${read ? 'is-read' : ''}`} aria-label={read ? 'Read' : 'Sent'}>
      <Icon name="check" size={13} />
      {read && <Icon name="check" size={13} />}
    </span>
  )
}

function Conversation({ conversation, mine, active, onOpen }) {
  const { name, unread, lastMessage } = conversation
  return (
    <button type="button" className={`chat-list__item ${active ? 'is-active' : ''}`} onClick={onOpen}>
      <span className="chat-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <span className="chat-list__text">
        <span className="chat-list__top">
          <strong>{name}</strong>
          {lastMessage && <span className="chat-list__time">{formatTime(lastMessage.createdAt)}</span>}
        </span>
        <span className="chat-list__bottom">
          <span className="chat-list__preview">{preview(lastMessage, mine)}</span>
          {unread > 0 && <span className="chat-list__badge">{unread > 99 ? '99+' : unread}</span>}
        </span>
      </span>
    </button>
  )
}

function Thread({ conversation, mine: mineType, messages, hasMore, connected, onSend, onLoadOlder, onBack }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const listRef = useRef(null)
  const stickToBottom = useRef(true)

  // New message: stay at the bottom, unless the manager scrolled up to read older ones.
  useLayoutEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView()
  }, [messages])

  useEffect(() => {
    stickToBottom.current = true
  }, [conversation.id])

  function handleScroll() {
    const list = listRef.current
    if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80
  }

  async function submit(event) {
    event?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setProblem('')
    stickToBottom.current = true
    const error = await onSend(body)
    setSending(false)
    if (error) setProblem(error)
    else setText('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) submit(event)
  }

  return (
    <section className="chat-thread">
      <header className="chat-thread__header">
        <button type="button" className="chat-thread__back" onClick={onBack} aria-label="Back to conversations">
          <Icon name="arrowLeft" size={20} />
        </button>
        <span className="chat-avatar" aria-hidden="true">
          {initials(conversation.name)}
        </span>
        <span>
          <strong>{conversation.name}</strong>
          <span className="chat-thread__sub">{connected ? 'Online' : 'Reconnecting...'}</span>
        </span>
      </header>

      <div className="chat-thread__messages" ref={listRef} onScroll={handleScroll}>
        {hasMore && (
          <button type="button" className="chat-thread__older" onClick={onLoadOlder}>
            Load older messages
          </button>
        )}
        {messages.length === 0 && <p className="chat-thread__empty">No messages yet. Say hello to {conversation.name}.</p>}
        {messages.map((message, index) => {
          const day = formatDay(message.createdAt)
          const showDay = index === 0 || formatDay(messages[index - 1].createdAt) !== day
          const mine = message.senderType === mineType
          return (
            <div key={message.messageId} className="chat-thread__row">
              {showDay && <span className="chat-day">{day}</span>}
              <div className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
                <span className="chat-bubble__text">{message.body}</span>
                <span className="chat-bubble__meta">
                  {formatTime(message.createdAt)}
                  {mine && <Ticks read={Boolean(message.readAt)} />}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {problem && (
        <p className="chat-thread__problem" role="alert">
          {problem}
        </p>
      )}
      <form className="chat-composer" onSubmit={submit}>
        <textarea
          className="chat-composer__input"
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Type a message"
          aria-label="Message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="chat-composer__send" disabled={!text.trim() || sending || !connected} aria-label="Send message">
          <Icon name="send" size={19} />
        </button>
      </form>
    </section>
  )
}

/** The chat screen shared by the Organization Manager and the Organization portals. `chat` comes from the portal's own hook; `mine` is the sender type of the signed-in side. */
function ChatView({ chat, mine, description, emptyTitle, emptyText, placeholder }) {
  const { conversations, error, selectedId, messages, hasMore, connected, connectProblem } = chat
  const selected = conversations?.find((c) => c.id === selectedId) ?? null

  return (
    <div className="page chat-page">
      <PageHeader title="Chat" description={description} />

      {error && !conversations ? (
        <div className="card">
          <ErrorState error={{ message: error }} onRetry={chat.reload} />
        </div>
      ) : !conversations ? (
        <Spinner label="Loading chats..." />
      ) : conversations.length === 0 ? (
        <div className="card">
          <EmptyState icon="users" title={emptyTitle} text={emptyText} />
        </div>
      ) : (
        <div className={`card chat ${selected ? 'is-thread-open' : ''}`}>
          <aside className="chat-list" aria-label="Conversations">
            {!connected && <p className="chat-list__offline">{connectProblem || 'Connecting to chat...'}</p>}
            {conversations.map((conversation) => (
              <Conversation key={conversation.id} conversation={conversation} mine={mine} active={conversation.id === selectedId} onOpen={() => chat.select(conversation.id)} />
            ))}
          </aside>

          {selected ? (
            <Thread
              key={selected.id}
              conversation={selected}
              mine={mine}
              messages={messages[selected.id] ?? []}
              hasMore={Boolean(hasMore[selected.id])}
              connected={connected}
              onSend={(body) => chat.send(selected.id, body)}
              onLoadOlder={chat.loadOlder}
              onBack={() => chat.select(null)}
            />
          ) : (
            <div className="chat-placeholder">
              <Icon name="inbox" size={34} />
              <p>{placeholder}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ChatView
