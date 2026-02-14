package com.roterizacao.driver.data.api

import com.roterizacao.driver.data.models.Driver
import com.roterizacao.driver.data.models.Route
import com.roterizacao.driver.data.models.RoutePoint
import com.roterizacao.driver.data.models.ChatMessage
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.PATCH
import retrofit2.http.Query

interface ApiService {
    @GET("drivers")
    suspend fun getDriverByCpf(@Query("cpf") cpfQuery: String): Response<List<Driver>>

    @GET("routes?select=*,route_points(*),driver:drivers(*)&order=route_date.desc")
    suspend fun getRoutes(@Query("driver_id") driverId: String? = null): Response<List<Route>>

    @GET("routes?select=*,route_points(*),driver:drivers(*)")
    suspend fun getRouteDetails(@Query("id") idQuery: String): Response<List<Route>>

    @Headers("Prefer: return=representation")
    @PATCH("route_points")
    suspend fun updatePointStatus(
        @Query("id") idQuery: String, 
        @Body body: @JvmSuppressWildcards Map<String, Any> 
    ): Response<List<RoutePoint>>

    @Headers("Prefer: return=representation")
    @PATCH("routes")
    suspend fun updateRouteStatus(
        @Query("id") idQuery: String,
        @Body body: @JvmSuppressWildcards Map<String, Any>
    ): Response<List<Route>>

    @GET("route_messages")
    suspend fun getMessages(
        @Query("route_id") routeIdQuery: String,
        @Query("order") order: String = "created_at.asc"
    ): Response<List<ChatMessage>>

    @Headers("Prefer: return=representation")
    @retrofit2.http.POST("route_messages")
    suspend fun sendMessage(@Body body: @JvmSuppressWildcards Map<String, Any>): Response<List<ChatMessage>>

    @retrofit2.http.DELETE("route_messages")
    suspend fun deleteMessage(@Query("id") idQuery: String): Response<Void>
    
    // WebRTC Calls
    @Headers("Prefer: return=representation")
    @retrofit2.http.POST("calls")
    suspend fun createCall(@Body body: @JvmSuppressWildcards Map<String, Any>): Response<List<Map<String, Any>>>
    
    
    @GET("calls")
    suspend fun getCalls(
        @Query("route_id") routeIdQuery: String,
        @Query("status") statusQuery: String? = null,
        @Query("order") order: String = "created_at.desc",
        @Query("limit") limit: Int = 10
    ): Response<List<Map<String, Any>>>
    
    // Overload for filtering by call ID (for outgoing call polling)
    @GET("calls")
    suspend fun getCallById(
        @Query("id") idQuery: String,
        @Query("select") select: String = "*"
    ): Response<List<Map<String, Any>>>
    
    @Headers("Prefer: return=representation")
    @PATCH("calls")
    suspend fun updateCall(
        @Query("id") idQuery: String,
        @Body body: @JvmSuppressWildcards Map<String, Any>
    ): Response<List<Map<String, Any>>>
}
