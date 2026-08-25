<?php

namespace Tests\Feature;

use App\AI\AIProviderInterface;
use App\AI\AIProviderManager;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class FakeProvider implements AIProviderInterface
{
    public bool $shouldFail = false;

    public function complete(array $messages, array $options = []): string
    {
        return implode('', iterator_to_array($this->stream($messages, $options)));
    }

    public function stream(array $messages, array $options = []): Generator
    {
        if ($this->shouldFail) {
            throw new RuntimeException('Simulated provider failure.');
        }

        yield 'Halo, ';
        yield 'Commander.';
    }

    public function testConnection(): array
    {
        return ['ok' => true, 'message' => 'fake ok', 'latency_ms' => 5];
    }
}

class FakeProviderManager extends AIProviderManager
{
    public function __construct(public readonly FakeProvider $fake) {}

    public function defaultProviderName(): string
    {
        return 'fake';
    }

    public function provider(?string $name = null): AIProviderInterface
    {
        return $this->fake;
    }
}

class ChatTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private FakeProvider $fake;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->fake = new FakeProvider;
        $this->instance(AIProviderManager::class, new FakeProviderManager($this->fake));
    }

    public function test_chat_requires_authentication(): void
    {
        $this->postJson('/api/chat', ['message' => 'Hello'])
            ->assertUnauthorized();
    }

    public function test_chat_streams_sse_and_stores_messages(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/chat', ['message' => 'Status sistem, Jarvis.']);

        $response->assertOk();

        $body = $response->streamedContent();

        $this->assertStringContainsString('event: meta', $body);
        $this->assertStringContainsString('"conversation_id"', $body);
        $this->assertStringContainsString('event: delta', $body);
        $this->assertStringContainsString('Halo, ', $body);
        $this->assertStringContainsString('Commander.', $body);
        $this->assertStringContainsString('event: done', $body);

        $conversation = Conversation::first();
        $this->assertSame($this->user->id, $conversation->user_id);
        $this->assertSame(2, $conversation->messages()->count());

        $assistant = Message::where('role', 'assistant')->first();
        $this->assertSame('Halo, Commander.', $assistant->content);
        $this->assertSame('completed', $assistant->status);
        $this->assertSame('fake', $assistant->model);
        $this->assertNotNull($conversation->last_message_at);
    }

    public function test_chat_appends_to_existing_conversation(): void
    {
        $conversation = Conversation::create(['user_id' => $this->user->id, 'title' => 'Existing']);

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/chat', [
                'message' => 'Second message.',
                'conversation_id' => $conversation->id,
            ])
            ->assertOk();

        // Konsumsi stream agar callback SSE tereksekusi.
        $response->streamedContent();

        $this->assertSame(2, $conversation->messages()->count());
    }

    public function test_chat_emits_error_event_when_provider_fails(): void
    {
        $this->fake->shouldFail = true;

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/chat', ['message' => 'Trigger failure.']);

        $response->assertOk();
        $body = $response->streamedContent();

        $this->assertStringContainsString('event: error', $body);

        // Pesan user tetap tersimpan; pesan assistant gagal tidak dibuat.
        $conversation = Conversation::first();
        $this->assertSame(1, $conversation->messages()->count());
        $this->assertSame('user', $conversation->messages()->first()->role);
    }

    public function test_user_cannot_send_message_to_foreign_conversation(): void
    {
        $other = User::factory()->create();
        $foreign = Conversation::create(['user_id' => $other->id, 'title' => 'Foreign']);

        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/chat', [
                'message' => 'Intruding.',
                'conversation_id' => $foreign->id,
            ])
            ->assertNotFound();
    }

    public function test_conversations_index_show_and_delete(): void
    {
        $conversation = Conversation::create(['user_id' => $this->user->id, 'title' => 'Mine']);
        $foreign = Conversation::create(['user_id' => User::factory()->create()->id, 'title' => 'Not mine']);

        $list = $this->actingAs($this->user, 'sanctum')->getJson('/api/conversations');
        $list->assertOk()->assertJsonCount(1, 'conversations');

        $this->actingAs($this->user, 'sanctum')
            ->getJson("/api/conversations/{$foreign->id}")
            ->assertNotFound();

        $this->actingAs($this->user, 'sanctum')
            ->deleteJson("/api/conversations/{$conversation->id}")
            ->assertOk();

        $this->assertModelMissing($conversation);
    }

    public function test_message_validation_rejects_empty_content(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/chat', ['message' => ''])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('message');
    }

    public function test_provider_connection_test_endpoint_uses_bound_manager(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/providers/test')
            ->assertOk()
            ->assertJsonFragment(['ok' => true, 'provider' => 'fake']);
    }
}
