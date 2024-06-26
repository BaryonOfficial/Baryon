import React from 'react';
import { useForm, ValidationError } from '@formspree/react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

function PluginSignUp() {
  const [state, handleSubmit] = useForm('xzzpprdb');

  if (state.succeeded) {
    return <p>Thanks for signing up!</p>;
  }

  return (
    <Form>
      <form onSubmit={handleSubmit} className="space-y-8">
        <FormField
          name="name"
          render={() => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input name="name" required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="email"
          render={() => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" name="email" required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="number"
          render={() => (
            <FormItem>
              <FormLabel>Phone Number (optional)</FormLabel>
              <FormControl>
                <Input type="tel" name="number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button
          type="submit"
          disabled={state.submitting}
          className="px-4 py-2 bg-blue-500 text-white rounded">
          {state.submitting ? 'Signing Up...' : 'Sign Up'}
        </button>
        <ValidationError errors={state.errors} />
      </form>
    </Form>
  );
}

export default PluginSignUp;
