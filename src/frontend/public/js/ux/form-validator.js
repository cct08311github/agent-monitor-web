/**
 * Form Validator — Field-level validation with ARIA support.
 * Rules: required, maxLength, minLength, date, nonemptySelect.
 * Blur-triggered real-time validation with input-event clearing.
 */
(function () {
    'use strict';

    var RULES = {
        required: function (value) {
            return value.trim() ? null : '此欄位為必填';
        },
        maxLength: function (max) {
            return function (value) {
                return value.length <= max ? null : '最多 ' + max + ' 個字元';
            };
        },
        minLength: function (min) {
            return function (value) {
                return value.length >= min ? null : '至少 ' + min + ' 個字元';
            };
        },
        date: function (value) {
            if (!value.trim()) return null;
            var d = new Date(value);
            return isNaN(d.getTime()) ? '請輸入有效日期' : null;
        },
        nonemptySelect: function (value) {
            return value ? null : '請選擇一個選項';
        }
    };

    function setFieldError(field, msg) {
        field.classList.add('input-error');
        field.setAttribute('aria-invalid', 'true');

        var errorId = field.id + '-error';
        var existing = document.getElementById(errorId);
        if (existing) {
            existing.textContent = msg;
        } else {
            var span = document.createElement('span');
            span.id = errorId;
            span.className = 'field-error-msg';
            span.textContent = msg;
            span.setAttribute('role', 'alert');
            field.setAttribute('aria-describedby', errorId);
            field.parentNode.insertBefore(span, field.nextSibling);
        }
    }

    function clearFieldError(field) {
        field.classList.remove('input-error');
        field.removeAttribute('aria-invalid');

        var errorId = field.id + '-error';
        var existing = document.getElementById(errorId);
        if (existing) {
            existing.parentNode.removeChild(existing);
        }
        field.removeAttribute('aria-describedby');
    }

    function validateField(field, rules) {
        var value = field.value || '';
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            var fn = typeof rule === 'function' ? rule : RULES[rule];
            if (!fn) continue;
            var error = fn(value);
            if (error) {
                setFieldError(field, error);
                return error;
            }
        }
        clearFieldError(field);
        return null;
    }

    function validateForm(fieldConfigs) {
        var errors = [];
        for (var i = 0; i < fieldConfigs.length; i++) {
            var cfg = fieldConfigs[i];
            var field = typeof cfg.field === 'string'
                ? document.getElementById(cfg.field)
                : cfg.field;
            if (!field) continue;
            var error = validateField(field, cfg.rules);
            if (error) {
                errors.push({ field: field, message: error });
            }
        }
        if (errors.length > 0) {
            errors[0].field.focus();
        }
        return errors;
    }

    function attachRealtimeValidation(fieldConfigs) {
        for (var i = 0; i < fieldConfigs.length; i++) {
            (function (cfg) {
                var field = typeof cfg.field === 'string'
                    ? document.getElementById(cfg.field)
                    : cfg.field;
                if (!field) return;

                field.addEventListener('blur', function () {
                    validateField(field, cfg.rules);
                });

                field.addEventListener('input', function () {
                    if (field.classList.contains('input-error')) {
                        clearFieldError(field);
                    }
                });
            })(fieldConfigs[i]);
        }
    }

    var api = {
        validateForm: validateForm,
        validateField: validateField,
        attachRealtimeValidation: attachRealtimeValidation,
        setFieldError: setFieldError,
        clearFieldError: clearFieldError,
        RULES: RULES
    };

    if (window.App && window.App.register) {
        App.register('FormValidator', api);
    }
    window.FormValidator = api;
})();
