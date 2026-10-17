import ChatView from '../../../components/chat/ChatView.jsx'
import { useManagerChat } from './useManagerChat.js'

/** Organization Manager: chat with the organizations assigned to the manager (live, like a small WhatsApp). */
function ManagerChatPage() {
  const chat = useManagerChat()
  return (
    <ChatView
      chat={chat}
      mine="Manager"
      description="Talk to the organizations assigned to you. Messages arrive instantly."
      emptyTitle="No organizations yet"
      emptyText="The administrator has not assigned any organization to you, so there is nobody to chat with."
      placeholder="Choose an organization to start chatting."
    />
  )
}

export default ManagerChatPage
