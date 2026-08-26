<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');
        // Aplikasi ini API murni tanpa route bernama "login" — arahkan tamu
        // ke URL biasa agar tidak memicu RouteNotFoundException.
        $middleware->redirectGuestsTo(fn () => url('/'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Semua request under /api/* harus selalu dapat JSON 401 saat belum
        // terautentikasi — termasuk request SSE yang Accept-nya bukan JSON.
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })->create();
