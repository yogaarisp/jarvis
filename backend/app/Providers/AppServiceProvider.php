<?php

namespace App\Providers;

use App\Agents\AgentRegistry;
use App\AI\AIProviderManager;
use App\Hermes\HermesClient;
use App\Settings\AppSettingsService;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(AIProviderManager::class);
        $this->app->singleton(HermesClient::class);
        $this->app->singleton(AgentRegistry::class);
        $this->app->singleton(AppSettingsService::class);
    }

    public function boot(): void
    {
        // Terapkan nilai DB setting ke config runtime.
        // Cek Schema agar tidak error saat fresh install sebelum migrate.
        try {
            if (App::isDownForMaintenance() === false && Schema::hasTable('app_settings')) {
                $this->app->make(AppSettingsService::class)->applyToConfig();
            }
        } catch (\Throwable) {
            // biarkan koneksi DB gagal saat install awal — pakai env default.
        }
    }
}
