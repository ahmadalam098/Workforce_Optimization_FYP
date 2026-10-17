import ChatView from '../../../components/chat/ChatView.jsx'
import { useOrganizationChat } from './useOrganizationChat.js'

/** Organization: chat with the manager(s) linked to this organization, for any query (live, like a small WhatsApp). */
function OrganizationChatPage() {
  const chat = useOrganizationChat()
  return (
    <ChatView
      chat={chat}
      mine="Organization"
      description="Have a question? Talk to your organization manager here. Messages arrive instantly."
      emptyTitle="No manager yet"
      emptyText="The administrator has not linked a manager to your organization yet, so there is nobody to chat with."
      placeholder="Choose a manager to start chatting."
    />
  )
}

export default OrganizationChatPage
