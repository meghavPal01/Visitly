import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'
import { EmptyState, ErrorState } from './ui'

function Trigger({ opts, msg = 'Saved' }) { const { toast } = useToast(); return <button onClick={() => toast(msg, opts)}>go</button> }

describe('Toast', () => {
  it('shows a message and runs undo once, then dismisses', async () => {
    const undo = vi.fn()
    render(<ToastProvider><Trigger opts={{ action: { label: 'Undo', run: undo } }} /></ToastProvider>)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
  it('keeps errors visible until dismissed and announces them as alerts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ToastProvider><Trigger opts={{ tone: 'error' }} msg="Failed" /></ToastProvider>)
    await userEvent.click(screen.getByText('go'))
    await act(async () => { vi.advanceTimersByTime(20000) })
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
  it('auto-dismisses plain confirmations', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ToastProvider><Trigger /></ToastProvider>)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(4500) })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('EmptyState and ErrorState', () => {
  it('renders the empty message', () => {
    render(<EmptyState title="No leads yet" body="New enquiries show up here." />)
    expect(screen.getByText('No leads yet')).toBeInTheDocument()
  })
  it('shows the error and a working retry button', async () => {
    const retry = vi.fn()
    render(<ErrorState error={{ message: 'Can’t reach the server.' }} onRetry={retry} />)
    expect(screen.getByText(/Can’t reach the server/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(retry).toHaveBeenCalled()
  })
})
