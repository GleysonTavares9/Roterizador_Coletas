package com.roterizacao.driver.data.models

data class ChatMessage(
    val id: String,
    val route_id: String,
    val sender_type: String,
    val message: String,
    val created_at: String
)
