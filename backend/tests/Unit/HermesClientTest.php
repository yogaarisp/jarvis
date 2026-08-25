<?php

namespace Tests\Unit;

use App\Hermes\HermesClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HermesClientTest extends TestCase
{
    private const BASE = 'https://hermes.test';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'hermes.base_url' => self::BASE,
            'hermes.api_key' => 'secret-key',
            'hermes.timeout' => 5,
        ]);
    }

    public function test_unconfigured_client_reports_not_ok(): void
    {
        // String kosong = tanpa fallback ke config.
        $client = new HermesClient('', '');

        $this->assertFalse($client->configured());

        $status = $client->testConnection();
        $this->assertFalse($status['ok']);

        $invoke = $client->invokeTool('system.ping');
        $this->assertFalse($invoke['ok']);
    }

    public function test_connection_success(): void
    {
        Http::fake([self::BASE.'/health' => Http::response(['status' => 'ok'], 200)]);

        $result = (new HermesClient)->testConnection();

        $this->assertTrue($result['ok']);
        $this->assertNotNull($result['latency_ms']);

        Http::assertSent(function ($request) {
            return $request->url() === self::BASE.'/health'
                && $request->hasHeader('Authorization', 'Bearer secret-key');
        });
    }

    public function test_connection_rejects_bad_credentials(): void
    {
        Http::fake([self::BASE.'/health' => Http::response(['message' => 'unauthorized'], 401)]);

        $result = (new HermesClient)->testConnection();

        $this->assertFalse($result['ok']);
        $this->assertStringContainsString('Autentikasi', $result['message']);
    }

    public function test_list_tools_success(): void
    {
        Http::fake([
            self::BASE.'/tools' => Http::response([
                'tools' => [
                    ['name' => 'system.health_check'],
                    ['name' => 'database.query'],
                ],
            ], 200),
        ]);

        $result = (new HermesClient)->listTools();

        $this->assertTrue($result['ok']);
        $this->assertCount(2, $result['tools']);
    }

    public function test_invoke_tool_success(): void
    {
        Http::fake([
            self::BASE.'/tools/system.ping/invoke' => Http::response(['output' => 'pong'], 200),
        ]);

        $result = (new HermesClient)->invokeTool('system.ping', ['target' => 'localhost']);

        $this->assertTrue($result['ok']);
        $this->assertSame(['output' => 'pong'], $result['result']);
        $this->assertSame(200, $result['status']);
    }

    public function test_invoke_tool_surfaces_server_error(): void
    {
        Http::fake([
            self::BASE.'/tools/broken.tool/invoke' => Http::response(['message' => 'boom'], 500),
        ]);

        $result = (new HermesClient)->invokeTool('broken.tool');

        $this->assertFalse($result['ok']);
        $this->assertSame('boom', $result['error']);
        $this->assertSame(500, $result['status']);
    }
}
