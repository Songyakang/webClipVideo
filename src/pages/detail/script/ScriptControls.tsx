import * as Select from "@radix-ui/react-select";

export const scriptButton = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#b1bac4] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b69aff] disabled:cursor-not-allowed disabled:opacity-40";

export function Choice({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger aria-label={label} className={`${scriptButton} min-w-0 justify-between`}>
        <span className="truncate"><Select.Value /></span>
        <Select.Icon aria-hidden="true">⌄</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={6} className="z-[1200] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22] p-1 shadow-xl">
          <Select.ScrollUpButton className="text-center text-[#8b949e]">⌃</Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item key={option.value} value={option.value} className="cursor-pointer rounded-md px-3 py-2 text-sm text-[#b1bac4] outline-none data-[highlighted]:bg-[#2a203d] data-[highlighted]:text-[#e6edf3] data-[state=checked]:text-[#d2b9ff]">
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="text-center text-[#8b949e]">⌄</Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
