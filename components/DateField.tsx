import { useState } from 'react';
import { View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Action } from '@/components/wealthline-ui';
export default function DateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Action secondary label={`${label}: ${value}`} onPress={() => setOpen(true)} />
      {open && (
        <DateTimePicker
          value={new Date(value + 'T12:00:00')}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_e, date) => {
            setOpen(false);
            if (date)
              onChange(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
              );
          }}
        />
      )}
    </View>
  );
}
