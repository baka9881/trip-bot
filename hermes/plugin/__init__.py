"""Inline buttons for the Flight Finder deal lists sent by workspace/deals (``--telegram``).

Each button carries ``ff:<text>`` as callback data. A tap is fed to the agent as an ordinary text
message from the person who tapped, so "B4 東京" behaves exactly as if it had been typed. The
pattern is scoped to ``ff:`` so Hermes' own buttons (approvals, clarify, pickers) keep working.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

PREFIX = "ff:"


def _factory(native, adapter):
    from telegram import Message
    from telegram.ext import CallbackQueryHandler
    from gateway.platforms.base import MessageType

    async def on_tap(update, context):
        query = update.callback_query
        if not query or not query.data or not query.message:
            return
        cb = adapter._callback_ctx(query)
        if not await adapter._callback_authorized(query, cb, "這個按鈕只有本人可以用"):
            return
        text = query.data[len(PREFIX):].strip()
        if not text:
            await query.answer()
            return
        await query.answer(text=f"已選 {text}")
        chat = query.message.chat
        # The tap leaves no bubble of its own; show the choice so the conversation reads clearly.
        try:
            await context.bot.send_message(chat_id=chat.id, text=f"👉 {text}")
        except Exception as exc:  # the agent still runs without the echo
            logger.warning("flight-deal-buttons: echo failed: %s", exc)
        message = Message(message_id=query.message.message_id, date=datetime.now(timezone.utc), chat=chat,
                          from_user=query.from_user, text=text)
        message.set_bot(context.bot)
        event = adapter._build_message_event(message, MessageType.TEXT, update.update_id)
        await adapter.handle_message(event)

    native.add_handler(CallbackQueryHandler(on_tap, pattern=f"^{PREFIX}"))


def register(ctx) -> None:
    ctx.register_telegram_handler(_factory)
