<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_token_and_user(): void
    {
        $user = User::factory()->create([
            'password' => 'jarvis123',
        ]);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'jarvis123',
        ])
            ->assertOk()
            ->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token']);

        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        User::factory()->create(['password' => 'jarvis123']);

        $this->postJson('/api/auth/login', [
            'email' => 'wrong@example.com',
            'password' => 'nope',
        ])->assertUnprocessable();
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_me_returns_authenticated_user(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.email', $user->email);
    }

    public function test_logout_revokes_current_token(): void
    {
        $user = User::factory()->create([
            'password' => 'jarvis123',
        ]);

        $login = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'jarvis123',
        ]);
        $login->assertOk();

        // Create a second token to prove only current one is revoked.
        $other = $user->createToken('other');

        $token = $login->json('token');

        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();

        // Reset resolved guards: RequestGuard caches the user across in-test requests.
        $this->app->make('auth')->forgetGuards();

        $this->withoutToken()->getJson('/api/me')->assertUnauthorized();
        $this->withToken($other->plainTextToken)->getJson('/api/me')->assertOk();
    }
}
