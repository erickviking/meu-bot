// File: src/components/ChatViewSkeleton.jsx

import React from 'react';
import './ChatView.css'; // Reutilizaremos o CSS

const ChatViewSkeleton = () => {
    return (
        <div className="chat-view-container">
            <div className="chat-main-panel">
                {/* Skeleton do Header */}
                <div className="chat-header">
                    <div className="skeleton skeleton-title"></div>
                    <div className="skeleton skeleton-select"></div>
                </div>

                {/* Skeleton das Mensagens */}
                <div className="chat-messages">
                    <div className="skeleton-message-row-left">
                        <div className="skeleton skeleton-bubble"></div>
                    </div>
                    <div className="skeleton-message-row-right">
                        <div className="skeleton skeleton-bubble"></div>
                    </div>
                    <div className="skeleton-message-row-left">
                        <div className="skeleton skeleton-bubble-short"></div>
                    </div>
                </div>

                {/* Skeleton do Input */}
                <div className="chat-input">
                    <div className="skeleton skeleton-input"></div>
                    <div className="skeleton skeleton-button"></div>
                </div>
            </div>
            {/* Skeleton da Sidebar */}
            <div className="summary-sidebar">
                <div className="skeleton skeleton-title"></div>
                <div className="skeleton skeleton-summary-content"></div>
                <div className="skeleton skeleton-button"></div>
            </div>
        </div>
    );
};

export default ChatViewSkeleton;
