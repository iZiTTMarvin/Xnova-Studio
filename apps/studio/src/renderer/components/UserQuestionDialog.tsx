import { useEffect, useMemo, useState } from 'react'
import type {
  UserQuestionDialogQuestion,
  UserQuestionDialogRequest,
  UserQuestionDialogResponse,
} from '../../shared/studio-bridge-contract'
import './UserQuestionDialog.css'

interface UserQuestionDialogProps {
  request: UserQuestionDialogRequest | null
  onRespond(response: UserQuestionDialogResponse): void | Promise<void>
}

type UserQuestionAnswerValue = string | string[]

function buildInitialAnswers(
  questions: UserQuestionDialogQuestion[],
): Record<string, UserQuestionAnswerValue> {
  return Object.fromEntries(
    questions.map((question) => [
      question.key,
      question.type === 'multiselect' ? [] : '',
    ]),
  )
}

function normalizeAnswers(
  answers: Record<string, UserQuestionAnswerValue>,
): Record<string, UserQuestionAnswerValue> {
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  )
}

export function UserQuestionDialog({
  request,
  onRespond,
}: UserQuestionDialogProps) {
  const [answers, setAnswers] = useState<Record<string, UserQuestionAnswerValue>>({})

  useEffect(() => {
    setAnswers(request ? buildInitialAnswers(request.questions) : {})
  }, [request])

  const questionCountLabel = useMemo(() => {
    if (!request) {
      return null
    }
    return `${request.questions.length} 个问题待确认`
  }, [request])

  if (!request) {
    return null
  }

  const respond = (response: UserQuestionDialogResponse): void => {
    void onRespond(response)
  }

  const updateTextAnswer = (key: string, value: string): void => {
    setAnswers((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const updateMultiSelectAnswer = (
    key: string,
    optionLabel: string,
    checked: boolean,
  ): void => {
    setAnswers((current) => {
      const currentValue = current[key]
      const currentSelection = Array.isArray(currentValue) ? currentValue : []
      const nextSelection = checked
        ? [...currentSelection, optionLabel]
        : currentSelection.filter((item) => item !== optionLabel)

      return {
        ...current,
        [key]: nextSelection,
      }
    })
  }

  return (
    <div className="user-question-dialog-backdrop" role="presentation">
      <section
        className="user-question-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="用户问题确认"
      >
        <div className="user-question-dialog-header">
          <div>
            <p className="user-question-dialog-eyebrow">用户交互</p>
            <h2>请补充当前任务信息</h2>
          </div>
          {questionCountLabel ? (
            <span className="user-question-dialog-count">{questionCountLabel}</span>
          ) : null}
        </div>

        <p className="user-question-dialog-description">
          Agent 需要你的回答后才能继续执行。你可以逐项填写，也可以直接取消本次提问。
        </p>

        <div className="user-question-dialog-body">
          {request.questions.map((question) => {
            const currentValue = answers[question.key]

            if (question.type === 'text') {
              return (
                <label
                  key={question.key}
                  className="user-question-dialog-field"
                >
                  <span className="user-question-dialog-label">{question.title}</span>
                  <textarea
                    rows={3}
                    aria-label={question.title}
                    value={typeof currentValue === 'string' ? currentValue : ''}
                    placeholder={question.placeholder ?? '请输入'}
                    onChange={(event) => {
                      updateTextAnswer(question.key, event.currentTarget.value)
                    }}
                  />
                </label>
              )
            }

            return (
              <fieldset
                key={question.key}
                className="user-question-dialog-fieldset"
              >
                <legend>{question.title}</legend>
                <div className="user-question-dialog-options">
                  {(question.options ?? []).map((option) => {
                    const inputId = `${request.requestId}-${question.key}-${option.label}`
                    const checked =
                      question.type === 'select'
                        ? currentValue === option.label
                        : Array.isArray(currentValue) &&
                          currentValue.includes(option.label)

                    return (
                      <label
                        key={option.label}
                        className="user-question-dialog-option"
                        htmlFor={inputId}
                      >
                        <input
                          id={inputId}
                          type={question.type === 'select' ? 'radio' : 'checkbox'}
                          name={question.key}
                          checked={checked}
                          onChange={(event) => {
                            if (question.type === 'select') {
                              updateTextAnswer(question.key, option.label)
                              return
                            }
                            updateMultiSelectAnswer(
                              question.key,
                              option.label,
                              event.currentTarget.checked,
                            )
                          }}
                        />
                        <span className="user-question-dialog-option-copy">
                          <strong>{option.label}</strong>
                          {option.description ? <small>{option.description}</small> : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>

        <div className="user-question-dialog-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              respond({
                requestId: request.requestId,
                cancelled: true,
                answers: {},
              })
            }}
          >
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              respond({
                requestId: request.requestId,
                cancelled: false,
                answers: normalizeAnswers(answers),
              })
            }}
          >
            提交回答
          </button>
        </div>
      </section>
    </div>
  )
}
