package com.roterizacao.driver.data.models

// Response from Supabase
// Join with route_points returns nested list

import com.google.gson.annotations.SerializedName

data class Route(
    val id: String,
    val name: String?,
    val status: String?,
    val vehicle_plate: String?,
    val points_count: Int?,
    val total_points: Int?, // Mapeado do JSON se vier, ou usar points_count
    @SerializedName(value = "total_distance_km", alternate = ["total_distance", "distance"])
    val total_distance_km: Double?,
    val total_time: Int?,
    val total_weight: Double?,
    val created_at: String?,
    val route_date: String?, // Importante para o novo filtro de data
    val final_km: Double? = null,
    val route_points: List<RoutePoint>? = null,
    val driver: Driver? = null
)

data class RoutePoint(
    val id: String,
    val address: String?,
    val client_name: String?,  // Changed from customer_name to match Supabase
    val cost_vector_name: String?,  // Added to match Supabase
    val status: String?,
    val sequence: Int?,
    val weight: Double?,
    val actual_weight: Double?,
    val observation: String?,
    val is_recurring: Boolean? = false,  // Added to match Supabase
    val latitude: Double? = null,  // For map display
    val longitude: Double? = null,  // For map display
    val visited_at: String? = null,  // Timestamp when driver arrived
    val completed_at: String? = null  // Timestamp when collection completed
)
