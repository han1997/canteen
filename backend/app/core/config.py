from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Canteen Backend"
    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    jwt_secret_key: str = "change_this_to_long_random_secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    database_url: str = (
        "mysql+pymysql://canteen:change_me@127.0.0.1:3306/canteen_db?charset=utf8mb4"
    )

    booking_seed_days: int = 14
    booking_auto_open_days: int = 2
    default_meal_image_url: str = "/static/default-meal.png"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

