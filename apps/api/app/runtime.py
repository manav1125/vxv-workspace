from __future__ import annotations

import os
from dataclasses import dataclass
from importlib import import_module
from threading import Lock
from typing import Optional

from .models import IntegrationStatus


def _module_exists(module_name: str) -> bool:
    try:
        import_module(module_name)
    except Exception:
        return False
    return True


def _resolve_model_provider() -> tuple[Optional[str], Optional[dict], str]:
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        return (
            "openai",
            {
                "config_name": "vxv_founder_os",
                "model_type": "openai_chat",
                "model_name": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                "api_key": openai_key,
            },
            "Using OPENAI_API_KEY for AgentScope dialog execution.",
        )

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        return (
            "anthropic",
            {
                "config_name": "vxv_founder_os",
                "model_type": "anthropic_chat",
                "model_name": os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
                "api_key": anthropic_key,
            },
            "Using ANTHROPIC_API_KEY for AgentScope dialog execution.",
        )

    dashscope_key = os.getenv("DASHSCOPE_API_KEY")
    if dashscope_key:
        return (
            "dashscope",
            {
                "config_name": "vxv_founder_os",
                "model_type": "dashscope_chat",
                "model_name": os.getenv("DASHSCOPE_MODEL", "qwen-plus"),
                "api_key": dashscope_key,
            },
            "Using DASHSCOPE_API_KEY for AgentScope dialog execution.",
        )

    return (
        None,
        None,
        "AgentScope is installed, but no supported model provider credentials were found.",
    )


@dataclass
class RuntimeCapabilities:
    agentscope_python_available: bool
    agentscope_configured: bool
    reme_available: bool
    runtime_target: str
    mode: str
    runtime_provider: Optional[str]
    runtime_reason: Optional[str]

    def to_model(self) -> IntegrationStatus:
        return IntegrationStatus(
            agentscope_python_available=self.agentscope_python_available,
            agentscope_configured=self.agentscope_configured,
            reme_available=self.reme_available,
            runtime_target=self.runtime_target,
            mode=self.mode,
            runtime_provider=self.runtime_provider,
            runtime_reason=self.runtime_reason,
        )


def detect_runtime_capabilities() -> RuntimeCapabilities:
    agentscope_ready = _module_exists("agentscope")
    reme_ready = _module_exists("reme")
    provider, _, reason = _resolve_model_provider()

    if agentscope_ready and provider:
        mode = "agent-live"
    elif agentscope_ready:
        mode = "framework-installed"
    else:
        mode = "demo"

    return RuntimeCapabilities(
        agentscope_python_available=agentscope_ready,
        agentscope_configured=provider is not None,
        reme_available=reme_ready,
        runtime_target="agentscope-runtime",
        mode=mode,
        runtime_provider=provider,
        runtime_reason=reason,
    )


class AgentScopeRuntimeAdapter:
    """Small adapter that lets the product scaffold use AgentScope when ready."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._initialized = False
        self._provider: Optional[str] = None
        self._config_name = "vxv_founder_os"

    def is_ready(self) -> bool:
        capabilities = detect_runtime_capabilities()
        return (
            capabilities.agentscope_python_available
            and capabilities.agentscope_configured
        )

    def _initialize(self) -> None:
        provider, model_config, _ = _resolve_model_provider()
        if provider is None or model_config is None:
            raise RuntimeError("AgentScope runtime is not configured with provider credentials.")

        with self._lock:
            if self._initialized and self._provider == provider:
                return

            from agentscope import init

            init(
                model_configs=[model_config],
                project="vxv_workspace",
                name="founder_os_api",
                disable_saving=True,
                save_log=False,
                save_code=False,
                save_api_invoke=False,
                use_monitor=False,
            )

            self._provider = provider
            self._initialized = True

    def generate(self, *, agent_name: str, sys_prompt: str, user_prompt: str) -> str:
        if not self.is_ready():
            raise RuntimeError("AgentScope runtime is not ready.")

        self._initialize()

        from agentscope.agents import DialogAgent
        from agentscope.message import Msg

        agent = DialogAgent(
            name=agent_name,
            sys_prompt=sys_prompt,
            model_config_name=self._config_name,
            use_memory=True,
        )
        response = agent(Msg("Founder", user_prompt, role="user"))
        return str(response.content)
