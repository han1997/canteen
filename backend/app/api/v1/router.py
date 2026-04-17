from fastapi import APIRouter

from app.api.v1 import admin, auth, meals, orders, stats

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(meals.router)
api_router.include_router(orders.router)
api_router.include_router(admin.router)
api_router.include_router(stats.router)

