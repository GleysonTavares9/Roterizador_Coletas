package com.roterizacao.driver.data.models

data class Driver(
    val id: String,
    val name: String?,
    val cpf: String?,
    val active: Boolean?,
    val photo_url: String?
)
